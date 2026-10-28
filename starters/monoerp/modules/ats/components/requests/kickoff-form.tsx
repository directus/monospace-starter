import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { requiredRelation, requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Uuid } from '@/generated/monospace'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatMoney } from '@/lib/format'
import { ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'
import { StageKindDot } from '@/modules/ats/components/jobs/job-badges'
import {
  optionalWholeNumber,
  textOrNull,
  countOrNull,
  toUuidOrNull,
} from '@/modules/ats/components/requests/form-helpers'
import { LocationsField } from '@/modules/ats/components/requests/locations-field'
import { roleRequestDetailQuery } from '@/modules/ats/data/requests'
import type { RoleRequestDetail } from '@/modules/ats/data/requests'
import { jobLevelsQuery } from '@/modules/ats/data/shared'
import { useCreateKickoffJob } from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.kickoff

const names = copy.defaultStages

type Stage = { key: string; name: string; kind: string }

const stage = (name: string, kind: string): Stage => ({ key: crypto.randomUUID(), name, kind })

// The spec's interview plans. A leadership role swaps the practical skills interview for a
// people leadership one; everything else is the same.
export function defaultStages(leadership: boolean): Array<Stage> {
  return [
    stage(names.application, 'application'),
    stage(names.recruiterScreen, 'screen'),
    stage(names.managerScreen, 'screen'),
    leadership ? stage(names.leadership, 'interview') : stage(names.practical, 'interview'),
    stage(names.team, 'interview'),
    stage(names.values, 'interview'),
    stage(names.debrief, 'debrief'),
    stage(names.backgroundCheck, 'background_check'),
    stage(names.offer, 'offer'),
    stage(names.hired, 'hired'),
  ]
}

// The board and offers depend on these, so they stay put.
const LOCKED_KINDS = new Set(['application', 'offer', 'hired'])

const isLocked = (item: Stage) => LOCKED_KINDS.has(item.kind)

export function KickoffFormDrawer({
  roleRequestId,
  open,
  onOpenChange,
}: {
  roleRequestId: Uuid
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const request = useQuery({ ...roleRequestDetailQuery(roleRequestId), enabled: open })

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      size="lg"
    >
      {request.isPending ? (
        <div className="p-5">
          <DataLoading rows={8} />
        </div>
      ) : null}
      {request.isError ? (
        <div className="p-5">
          <DataError error={request.error} />
        </div>
      ) : null}
      {request.data ? (
        <KickoffForm request={request.data} onDone={() => onOpenChange(false)} />
      ) : null}
    </FormDrawer>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function YesNo({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <Label id={id}>{label}</Label>
      <RadioGroup
        value={value ? 'yes' : 'no'}
        onValueChange={(next) => onChange(next === 'yes')}
        aria-labelledby={id}
        className="w-36 grid-cols-2"
      >
        <RadioGroupItem value="yes" className="h-8">
          {atsCopy.requests.requests.form.yes}
        </RadioGroupItem>
        <RadioGroupItem value="no" className="h-8">
          {atsCopy.requests.requests.form.no}
        </RadioGroupItem>
      </RadioGroup>
    </div>
  )
}

function approvedBudget(request: RoleRequestDetail) {
  const currency = request.approvedCurrency ?? request.currency ?? 'USD'
  const min = request.approvedBaseMin ?? request.compMin
  const max = request.approvedBaseMax ?? request.compMax

  if (!min || !max) return null

  return atsCopy.requests.finance.range(formatMoney(min, currency), formatMoney(max, currency))
}

type KickoffValues = {
  hiringManager: RelationOption | null
  recruiter: RelationOption | null
  title: string
  locations: string
  jobLevelId: string
  isConfidential: boolean
  postExternally: boolean
  recruitingSync: boolean
  reportsTo: RelationOption | null
  teamSize: string
  teamLocations: string
  isLeadership: boolean
  leadershipYears: string
  ledTeamSize: string
  leadershipQuestions: string
  mustHave: string
  niceToHave: string
  otherSkills: string
  stages: Array<Stage>
}

// Answers without a column of their own go into the job's kickoff notes, one per line, so they
// stay with the job after it closes.
function kickoffNotes(value: KickoffValues) {
  const notes = copy.notes
  const yesNo = (on: boolean) => (on ? notes.yes : notes.no)

  const lines = [
    `${notes.recruitingSync}: ${yesNo(value.recruitingSync)}`,
    value.reportsTo ? `${notes.reportsTo}: ${value.reportsTo.label}` : null,
    value.teamLocations.trim() ? `${notes.teamLocations}: ${value.teamLocations.trim()}` : null,
    value.isLeadership && value.leadershipYears
      ? `${notes.leadershipYears}: ${value.leadershipYears}`
      : null,
    value.isLeadership && value.ledTeamSize ? `${notes.ledTeamSize}: ${value.ledTeamSize}` : null,
    value.isLeadership && value.leadershipQuestions.trim()
      ? `${notes.leadershipQuestions}: ${value.leadershipQuestions.trim()}`
      : null,
    value.otherSkills.trim() ? `${notes.otherSkills}: ${value.otherSkills.trim()}` : null,
  ]

  return lines.filter(Boolean).join('\n')
}

function KickoffForm({ request, onDone }: { request: RoleRequestDetail; onDone: () => void }) {
  const currentUser = useCurrentUser()
  const levels = useQuery(jobLevelsQuery())
  const create = useCreateKickoffJob()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string>()
  const [stagesEdited, setStagesEdited] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())

  const hiringManager = ownerOption(request.hiringManagerUser)

  const leadership =
    request.job_levels?.track === 'manager' || request.job_levels?.track === 'executive'

  const defaultValues: KickoffValues = {
    hiringManager,
    recruiter: ownerOption(currentUser),
    title: request.roleName ?? '',
    locations: request.locations ?? '',
    jobLevelId: request.jobLevelId ?? '',
    isConfidential: false,
    postExternally: true,
    recruitingSync: true,
    reportsTo: hiringManager,
    teamSize: '',
    teamLocations: '',
    isLeadership: leadership,
    leadershipYears: '',
    ledTeamSize: '',
    leadershipQuestions: '',
    mustHave: '',
    niceToHave: '',
    otherSkills: '',
    stages: defaultStages(leadership),
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      if (!request.id || !request.departmentId) return

      if (value.stages.some((item) => !item.name.trim())) {
        setSubmitError(copy.stageRequired)

        return
      }

      try {
        const jobLevelId = toUuidOrNull(value.jobLevelId)

        const job = await create.mutateAsync({
          title: value.title.trim(),
          status: 'draft',
          departments: { _connect: { key: { id: request.departmentId } } },
          job_levels: jobLevelId ? { _connect: { key: { id: jobLevelId } } } : undefined,
          role_requests: { _connect: { key: { id: request.id } } },
          hiringManagerUserId: value.hiringManager?.value ?? null,
          recruiterUserId: value.recruiter?.value ?? null,
          employmentType: request.employmentType ?? 'full_time',
          numberOfHires: request.numberOfHires ?? 1,
          locations: textOrNull(value.locations),
          hiringReason: request.hiringReason ?? null,
          urgency: request.urgency ?? 'normal',
          compMin: request.approvedBaseMin ?? request.compMin ?? null,
          compMax: request.approvedBaseMax ?? request.compMax ?? null,
          currency: request.approvedCurrency ?? request.currency ?? 'USD',
          isConfidential: value.isConfidential,
          postExternally: value.postExternally,
          isLeadership: value.isLeadership,
          teamSize: countOrNull(value.teamSize),
          mustHaveSkills: textOrNull(value.mustHave),
          niceToHaveSkills: textOrNull(value.niceToHave),
          kickoffNotes: kickoffNotes(value),
          kickoffAt: new Date().toISOString(),
          interview_stages: [
            {
              _create: {
                data: value.stages.map((item, index) => ({
                  name: item.name.trim(),
                  kind: item.kind,
                  position: index + 1,
                })),
              },
            },
          ],
        })

        onDone()

        if (job.id) await navigate({ to: '/ats/jobs/$jobId', params: { jobId: job.id } })
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const levelOptions = (levels.data ?? []).map((level) => ({
    value: level.id,
    label: level.name ?? '',
  }))

  const budget = approvedBudget(request)

  return (
    <DrawerForm form={form}>
      <DrawerFormBody className="space-y-6">
        <Section title={copy.sections.people}>
          <p className="-mt-2 text-xs text-muted-foreground">
            {copy.stamp(formatDateTime(startedAt))}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField
              name="hiringManager"
              validators={{ onSubmit: requiredRelation(copy.hiringManager) }}
            >
              {(field) => (
                <field.RelationField
                  label={copy.hiringManager}
                  search={lookupUsers}
                  placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField
              name="recruiter"
              validators={{ onSubmit: requiredRelation(copy.recruiter) }}
            >
              {(field) => (
                <field.RelationField
                  label={copy.recruiter}
                  search={lookupUsers}
                  placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                />
              )}
            </form.AppField>
          </div>
        </Section>

        <Section title={copy.sections.role}>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField
              name="title"
              validators={{
                onBlur: requiredText(copy.jobName),
                onSubmit: requiredText(copy.jobName),
              }}
            >
              {(field) => <field.TextField label={copy.jobName} className="sm:col-span-2" />}
            </form.AppField>
            <form.AppField name="jobLevelId">
              {(field) => (
                <field.SelectField
                  label={copy.level}
                  options={levelOptions}
                  placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                  optional
                />
              )}
            </form.AppField>
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {copy.approvedBudget}
                <Lock className="size-3 text-muted-foreground" />
              </p>
              <p className="flex h-8 items-center rounded-lg border bg-muted/40 px-2.5 text-sm tabular-nums">
                {budget ?? '–'}
              </p>
              <p className="text-xs text-muted-foreground">{copy.budgetLocked}</p>
            </div>
          </div>
          <form.AppField name="locations">
            {() => <LocationsField label={copy.locations} />}
          </form.AppField>
          <div className="grid gap-2 sm:grid-cols-3">
            <form.AppField name="isConfidential">
              {(field) => (
                <field.CheckboxField label={copy.confidential} hint={copy.confidentialHint} />
              )}
            </form.AppField>
            <form.AppField name="postExternally">
              {(field) => (
                <field.CheckboxField label={copy.postExternally} hint={copy.postExternallyHint} />
              )}
            </form.AppField>
            <form.AppField name="recruitingSync">
              {(field) => (
                <field.CheckboxField label={copy.recruitingSync} hint={copy.recruitingSyncHint} />
              )}
            </form.AppField>
          </div>
        </Section>

        <Section title={copy.sections.team}>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="reportsTo">
              {(field) => (
                <field.RelationField
                  label={copy.reportsTo}
                  search={lookupUsers}
                  placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                  optional
                />
              )}
            </form.AppField>
            <form.AppField
              name="teamSize"
              validators={{ onBlur: optionalWholeNumber, onSubmit: optionalWholeNumber }}
            >
              {(field) => <field.TextField label={copy.teamSize} inputMode="numeric" optional />}
            </form.AppField>
          </div>
          <form.AppField name="teamLocations">
            {(field) => <field.TextareaField label={copy.teamLocations} rows={2} optional />}
          </form.AppField>
        </Section>

        <Section title={copy.sections.leadership}>
          <form.Field name="isLeadership">
            {(field) => (
              <YesNo
                id="kickoff-leadership"
                label={copy.isLeadership}
                value={field.state.value}
                onChange={(on) => {
                  field.handleChange(on)

                  if (!stagesEdited) form.setFieldValue('stages', defaultStages(on))
                }}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.isLeadership}>
            {(on) =>
              on ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <form.AppField
                    name="leadershipYears"
                    validators={{ onBlur: optionalWholeNumber, onSubmit: optionalWholeNumber }}
                  >
                    {(field) => (
                      <field.TextField label={copy.leadershipYears} inputMode="numeric" optional />
                    )}
                  </form.AppField>
                  <form.AppField
                    name="ledTeamSize"
                    validators={{ onBlur: optionalWholeNumber, onSubmit: optionalWholeNumber }}
                  >
                    {(field) => (
                      <field.TextField label={copy.ledTeamSize} inputMode="numeric" optional />
                    )}
                  </form.AppField>
                  <form.AppField name="leadershipQuestions">
                    {(field) => (
                      <field.TextareaField
                        label={copy.leadershipQuestions}
                        rows={3}
                        optional
                        className="sm:col-span-2"
                      />
                    )}
                  </form.AppField>
                </div>
              ) : null
            }
          </form.Subscribe>
        </Section>

        <Section title={copy.sections.skills}>
          <form.AppField name="mustHave">
            {(field) => <field.TextareaField label={copy.mustHave} rows={3} optional />}
          </form.AppField>
          <form.AppField name="niceToHave">
            {(field) => <field.TextareaField label={copy.niceToHave} rows={3} optional />}
          </form.AppField>
          <form.AppField name="otherSkills">
            {(field) => <field.TextareaField label={copy.otherSkills} rows={2} optional />}
          </form.AppField>
        </Section>

        <Section title={copy.sections.process}>
          <form.Field name="stages" mode="array">
            {(field) => {
              const stages = field.state.value

              const edit = (next: Array<Stage>) => {
                setStagesEdited(true)
                field.handleChange(next)
              }

              const move = (index: number, by: -1 | 1) => {
                const next = [...stages]
                const [item] = next.splice(index, 1)
                next.splice(index + by, 0, item)
                edit(next)
              }

              const canMove = (index: number, by: -1 | 1) => {
                const target = stages[index + by]

                return Boolean(target) && !isLocked(stages[index]) && !isLocked(target)
              }

              const offerIndex = stages.findIndex((item) => item.kind === 'offer')

              return (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{copy.stagesHint}</p>
                    {stagesEdited ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStagesEdited(false)
                          field.handleChange(defaultStages(form.getFieldValue('isLeadership')))
                        }}
                      >
                        <RotateCcw data-icon="inline-start" />
                        {copy.resetStages}
                      </Button>
                    ) : null}
                  </div>
                  <ol className="divide-y rounded-lg border">
                    {stages.map((item, index) => (
                      <li key={item.key} className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
                        <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {index + 1}
                        </span>
                        <StageKindDot kind={item.kind} />
                        {isLocked(item) ? (
                          <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 px-2.5 text-sm">
                            {item.name}
                            <Lock
                              className="size-3 text-muted-foreground"
                              aria-label={copy.lockedStage}
                            />
                          </span>
                        ) : (
                          <Input
                            aria-label={copy.stageName(index + 1)}
                            value={item.name}
                            className="h-8 min-w-0 flex-1 border-transparent shadow-none hover:border-input focus-visible:border-ring"
                            onChange={(event) =>
                              edit(
                                stages.map((other) =>
                                  other.key === item.key
                                    ? { ...other, name: event.target.value }
                                    : other,
                                ),
                              )
                            }
                          />
                        )}
                        {isLocked(item) ? (
                          <span className="w-[6.5rem] shrink-0" />
                        ) : (
                          <span className="flex shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canMove(index, -1)}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp />
                              <span className="sr-only">{copy.moveUp}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canMove(index, 1)}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown />
                              <span className="sr-only">{copy.moveDown}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => edit(stages.filter((other) => other.key !== item.key))}
                            >
                              <Trash2 />
                              <span className="sr-only">{copy.removeStage}</span>
                            </Button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = [...stages]
                      // New interviews go before the debrief, or before the offer without one.
                      const debrief = next.findIndex((item) => item.kind === 'debrief')
                      const at = debrief >= 0 ? debrief : offerIndex >= 0 ? offerIndex : next.length
                      next.splice(at, 0, stage(copy.newStage, 'interview'))
                      edit(next)
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    {copy.addStage}
                  </Button>
                </div>
              )
            }}
          </form.Field>
        </Section>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onDone}>
        <form.AppForm>
          <form.SubmitButton label={copy.save} pendingLabel={copy.saving} />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
