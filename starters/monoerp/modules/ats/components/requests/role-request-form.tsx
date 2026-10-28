import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { optionalAmount, requiredRelation, requiredText } from '@/components/form/validators'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { UserLabel } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import {
  amountOrNull,
  currencyOptions,
  optionsFor,
  textOrNull,
  toUuid,
  wholeNumber,
} from '@/modules/ats/components/requests/form-helpers'
import { LocationsField } from '@/modules/ats/components/requests/locations-field'
import { approvedPlanLinesQuery } from '@/modules/ats/data/requests'
import type { ApprovedPlanLine, RoleRequestDetail } from '@/modules/ats/data/requests'
import { departmentsQuery, jobLevelsQuery } from '@/modules/ats/data/shared'
import { useCreateRoleRequest, useResubmitRoleRequest } from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.requests

const form$ = copy.form

const MAX_HIRES = 50

const IMPACT_PREFIX = `${form$.impactLabel}: `

// Hires left on a plan line: approved, less what other live requests already asked for.
function hiresLeft(line: ApprovedPlanLine, excludeRequestId?: Uuid) {
  const requested = (line.role_requests?.data ?? [])
    .filter((request) => request.id !== excludeRequestId && request.status !== 'declined')
    .reduce((total, request) => total + (request.numberOfHires ?? 0), 0)

  return Math.max((line.approvedHeadcount ?? 0) - requested, 0)
}

export function RoleRequestDrawer({
  open,
  onOpenChange,
  planLineId,
  request,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Start from this approved plan line (the workforce plan's "Request this role").
  planLineId?: Uuid
  // Edit a returned request and send it back to finance.
  request?: RoleRequestDetail
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={request ? copy.editRequest : copy.newRequest}
      description={request?.decisionNote ?? undefined}
      size="lg"
    >
      <RoleRequestForm
        key={`${request?.id ?? 'new'}-${planLineId ?? ''}`}
        planLineId={planLineId}
        request={request}
        onDone={() => onOpenChange(false)}
      />
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

function RoleRequestForm({
  planLineId,
  request,
  onDone,
}: {
  planLineId?: Uuid
  request?: RoleRequestDetail
  onDone: () => void
}) {
  const currentUser = useCurrentUser()
  const planLines = useQuery(approvedPlanLinesQuery())
  const departments = useQuery(departmentsQuery())
  const levels = useQuery(jobLevelsQuery())
  const create = useCreateRoleRequest()
  const resubmit = useResubmitRoleRequest()
  const [submitError, setSubmitError] = useState<string>()

  const lines = planLines.data ?? []
  const lineFor = (id: string) => lines.find((line) => line.id === id)

  const [justification, impactDetail] = (request?.businessJustification ?? '').split(
    `\n\n${IMPACT_PREFIX}`,
  )

  const startLine = planLineId ?? request?.workforcePlanRoleId ?? ''
  const hiringManager: RelationOption | null = ownerOption(request?.hiringManagerUser)

  const form = useAppForm({
    defaultValues: {
      inPlan: startLine ? 'yes' : request ? 'no' : 'yes',
      planLineId: startLine,
      roleName: request?.roleName ?? '',
      departmentId: request?.departmentId ?? '',
      jobLevelId: request?.jobLevelId ?? '',
      hiringManager,
      locations: request?.locations ?? '',
      employmentType: request?.employmentType ?? 'full_time',
      numberOfHires: String(request?.numberOfHires ?? 1),
      justification: justification ?? '',
      hiringReason:
        request?.hiringReason && request.hiringReason !== 'workforce_plan'
          ? request.hiringReason
          : 'growth',
      hiringReasonDetail: request?.hiringReasonDetail ?? '',
      compMin: request?.compMin ?? '',
      compMax: request?.compMax ?? '',
      currency: request?.currency ?? 'USD',
      urgency: request?.urgency ?? 'normal',
      urgencyImpact: request?.urgencyImpact ?? '',
      impactDetail: impactDetail ?? '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      const line = value.inPlan === 'yes' ? lineFor(value.planLineId) : undefined
      const critical = value.urgency === 'critical'
      const detailNeeded = value.hiringReason === 'backfill' || value.hiringReason === 'other'

      const impactNote =
        critical && value.urgencyImpact === 'other' && value.impactDetail.trim()
          ? `\n\n${IMPACT_PREFIX}${value.impactDetail.trim()}`
          : ''

      const shared = {
        hiringManagerUserId: value.hiringManager?.value ?? null,
        locations: textOrNull(value.locations),
        numberOfHires: Number(value.numberOfHires),
        businessJustification: `${value.justification.trim()}${impactNote}`,
        urgency: value.urgency,
        urgencyImpact: critical ? value.urgencyImpact || null : null,
      }

      const role = line
        ? {
            roleName: line.roleName ?? '',
            departmentId: line.departmentId ? toUuid(line.departmentId) : null,
            jobLevelId: line.jobLevelId ?? null,
            employmentType: line.employmentType ?? 'full_time',
            hiringReason: 'workforce_plan',
            hiringReasonDetail: null,
            compMin: null,
            compMax: null,
            currency: line.currency ?? 'USD',
            workforcePlanRoleId: line.id,
          }
        : {
            roleName: value.roleName.trim(),
            departmentId: value.departmentId ? toUuid(value.departmentId) : null,
            jobLevelId: value.jobLevelId ? toUuid(value.jobLevelId) : null,
            employmentType: value.employmentType,
            hiringReason: value.hiringReason,
            hiringReasonDetail: detailNeeded ? textOrNull(value.hiringReasonDetail) : null,
            compMin: amountOrNull(value.compMin),
            compMax: amountOrNull(value.compMax),
            currency: value.currency,
            workforcePlanRoleId: null,
          }

      try {
        const { departmentId, jobLevelId, workforcePlanRoleId, ...rest } = role

        if (!departmentId) throw new Error(requiredMessage(form$.department))

        if (request?.id) {
          await resubmit.mutateAsync({
            id: request.id,
            data: { ...shared, ...rest, departmentId, jobLevelId, workforcePlanRoleId },
          })
        } else {
          await create.mutateAsync({
            ...shared,
            ...rest,
            requesterUserId: currentUser?.id ?? null,
            departments: { _connect: { key: { id: departmentId } } },
            job_levels: jobLevelId ? { _connect: { key: { id: jobLevelId } } } : undefined,
            workforce_plan_roles: workforcePlanRoleId
              ? { _connect: { key: { id: workforcePlanRoleId } } }
              : undefined,
          })
        }

        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const departmentOptions = (departments.data ?? []).map((department) => ({
    value: department.id,
    label: department.name ?? '',
  }))

  const levelOptions = (levels.data ?? []).map((level) => ({
    value: level.id,
    label: level.name ?? '',
  }))

  const lineOptions = lines.map((line) => ({
    value: line.id,
    label: form$.planLineOption(
      line.roleName ?? '',
      line.departments?.name ?? '',
      line.planYear ?? 0,
    ),
  }))

  const requester = request?.requesterUser ?? currentUser

  return (
    <DrawerForm form={form}>
      <DrawerFormBody className="space-y-6">
        <Section title={form$.sections.plan}>
          <form.Field name="inPlan">
            {(field) => (
              <div className="space-y-2">
                <Label id="in-plan-label" className="leading-snug">
                  {form$.inPlanQuestion}
                </Label>
                <RadioGroup
                  name={field.name}
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(String(value))}
                  aria-labelledby="in-plan-label"
                  className="grid-cols-2 sm:w-64"
                >
                  <RadioGroupItem value="yes" className="h-9">
                    {form$.yes}
                  </RadioGroupItem>
                  <RadioGroupItem value="no" className="h-9">
                    {form$.no}
                  </RadioGroupItem>
                </RadioGroup>
              </div>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.inPlan}>
            {(inPlan) =>
              inPlan === 'yes' ? (
                lines.length || planLines.isPending ? (
                  <form.AppField
                    name="planLineId"
                    validators={{ onSubmit: requiredText(form$.planLine) }}
                  >
                    {(field) => (
                      <field.SelectField
                        label={form$.planLine}
                        options={lineOptions}
                        placeholder={form$.planLinePlaceholder}
                      />
                    )}
                  </form.AppField>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {form$.noPlanLines}
                  </p>
                )
              ) : null
            }
          </form.Subscribe>

          <form.Subscribe
            selector={(state) =>
              state.values.inPlan === 'yes' ? lineFor(state.values.planLineId) : undefined
            }
          >
            {(line) =>
              line ? <PlanLineSummary line={line} requestId={request?.id ?? undefined} /> : null
            }
          </form.Subscribe>
        </Section>

        <Section title={form$.sections.role}>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Subscribe selector={(state) => state.values.inPlan}>
              {(inPlan) =>
                inPlan === 'no' ? (
                  <>
                    <form.AppField
                      name="roleName"
                      validators={{
                        onBlur: requiredText(form$.roleName),
                        onSubmit: ({ value, fieldApi }) =>
                          fieldApi.form.getFieldValue('inPlan') === 'no' && !value.trim()
                            ? { message: requiredMessage(form$.roleName) }
                            : undefined,
                      }}
                    >
                      {(field) => (
                        <field.TextField label={form$.roleName} className="sm:col-span-2" />
                      )}
                    </form.AppField>
                    <form.AppField
                      name="departmentId"
                      validators={{
                        onSubmit: ({ value, fieldApi }) =>
                          fieldApi.form.getFieldValue('inPlan') === 'no' && !value
                            ? { message: requiredMessage(form$.department) }
                            : undefined,
                      }}
                    >
                      {(field) => (
                        <field.SelectField
                          label={form$.department}
                          options={departmentOptions}
                          placeholder={form$.selectPlaceholder}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="jobLevelId">
                      {(field) => (
                        <field.SelectField
                          label={form$.level}
                          options={levelOptions}
                          placeholder={form$.selectPlaceholder}
                          optional
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="employmentType">
                      {(field) => (
                        <field.SelectField
                          label={form$.employmentType}
                          options={optionsFor('employmentType')}
                        />
                      )}
                    </form.AppField>
                  </>
                ) : null
              }
            </form.Subscribe>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{form$.requester}</p>
              <div className="flex h-8 items-center">
                <UserLabel user={requester} size="sm" />
              </div>
            </div>
            <form.AppField
              name="hiringManager"
              validators={{
                onBlur: requiredRelation(form$.hiringManager),
                onSubmit: requiredRelation(form$.hiringManager),
              }}
            >
              {(field) => (
                <field.RelationField
                  label={form$.hiringManager}
                  search={lookupUsers}
                  placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                />
              )}
            </form.AppField>
            <form.Subscribe
              selector={(state) =>
                state.values.inPlan === 'yes' ? lineFor(state.values.planLineId) : undefined
              }
            >
              {(line) => {
                const cap = line
                  ? Math.max(hiresLeft(line, request?.id ?? undefined), 1)
                  : MAX_HIRES

                return (
                  <form.AppField
                    name="numberOfHires"
                    validators={{
                      onBlur: wholeNumber({ min: 1, max: cap }),
                      onSubmit: wholeNumber({ min: 1, max: cap }),
                    }}
                  >
                    {(field) => (
                      <field.TextField
                        label={form$.numberOfHires}
                        inputMode="numeric"
                        hint={line ? form$.hiresCap(cap) : undefined}
                      />
                    )}
                  </form.AppField>
                )
              }}
            </form.Subscribe>
          </div>
          <form.AppField name="locations" validators={{ onSubmit: requiredText(form$.locations) }}>
            {() => <LocationsField label={form$.locations} />}
          </form.AppField>
        </Section>

        <Section title={form$.sections.need}>
          <form.AppField
            name="justification"
            validators={{
              onBlur: requiredText(form$.justification),
              onSubmit: requiredText(form$.justification),
            }}
          >
            {(field) => (
              <field.TextareaField
                label={form$.justification}
                hint={form$.justificationHint}
                rows={5}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.inPlan}>
            {(inPlan) =>
              inPlan === 'no' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <form.AppField name="hiringReason">
                    {(field) => (
                      <field.SelectField
                        label={form$.reason}
                        options={optionsFor('hiringReason', ['workforce_plan'])}
                      />
                    )}
                  </form.AppField>
                  <form.Subscribe selector={(state) => state.values.hiringReason}>
                    {(reason) =>
                      reason === 'backfill' || reason === 'other' ? (
                        <form.AppField
                          name="hiringReasonDetail"
                          validators={{
                            onSubmit: ({ value, fieldApi }) => {
                              const values = fieldApi.form.state.values

                              const needed =
                                values.inPlan === 'no' &&
                                (values.hiringReason === 'backfill' ||
                                  values.hiringReason === 'other')

                              return needed && !value.trim()
                                ? { message: requiredMessage(detailLabel(values.hiringReason)) }
                                : undefined
                            },
                          }}
                        >
                          {(field) =>
                            reason === 'backfill' ? (
                              <field.TextField label={form$.backfillWho} />
                            ) : (
                              <field.TextareaField
                                label={form$.otherReason}
                                rows={2}
                                className="sm:col-span-2"
                              />
                            )
                          }
                        </form.AppField>
                      ) : null
                    }
                  </form.Subscribe>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {form$.reason}: {optionLabel('hiringReason', 'workforce_plan')}
                </p>
              )
            }
          </form.Subscribe>
        </Section>

        <Section title={form$.sections.timing}>
          <form.Subscribe selector={(state) => state.values.inPlan}>
            {(inPlan) =>
              inPlan === 'no' ? (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
                  <form.AppField
                    name="compMin"
                    validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
                  >
                    {(field) => (
                      <field.TextField label={form$.compMin} inputMode="decimal" optional />
                    )}
                  </form.AppField>
                  <form.AppField
                    name="compMax"
                    validators={{
                      onBlur: optionalAmount,
                      onSubmit: ({ value, fieldApi }) => {
                        const min = fieldApi.form.getFieldValue('compMin')

                        if (!optionalAmount.safeParse(value).success) return undefined

                        return value && min && Number(value) < Number(min)
                          ? { message: form$.compOrder }
                          : undefined
                      },
                    }}
                  >
                    {(field) => (
                      <field.TextField label={form$.compMax} inputMode="decimal" optional />
                    )}
                  </form.AppField>
                  <form.AppField name="currency">
                    {(field) => (
                      <field.SelectField label={form$.currency} options={currencyOptions} />
                    )}
                  </form.AppField>
                  <p className="-mt-2 text-xs text-muted-foreground sm:col-span-3">
                    {form$.compHint}
                  </p>
                </div>
              ) : null
            }
          </form.Subscribe>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="urgency">
              {(field) => (
                <field.SelectField
                  label={form$.urgency}
                  options={optionsFor('urgency')}
                  hint={urgencyHint(field.state.value)}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.urgency}>
              {(urgency) =>
                urgency === 'critical' ? (
                  <form.AppField
                    name="urgencyImpact"
                    validators={{
                      onSubmit: ({ value, fieldApi }) =>
                        fieldApi.form.getFieldValue('urgency') === 'critical' && !value
                          ? { message: requiredMessage(form$.impact) }
                          : undefined,
                    }}
                  >
                    {(field) => (
                      <field.SelectField
                        label={form$.impact}
                        options={optionsFor('urgencyImpact')}
                        placeholder={form$.selectPlaceholder}
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>
          </div>
          <form.Subscribe
            selector={(state) =>
              state.values.urgency === 'critical' && state.values.urgencyImpact === 'other'
            }
          >
            {(show) =>
              show ? (
                <form.AppField
                  name="impactDetail"
                  validators={{
                    onSubmit: ({ value, fieldApi }) => {
                      const values = fieldApi.form.state.values

                      return values.urgency === 'critical' &&
                        values.urgencyImpact === 'other' &&
                        !value.trim()
                        ? { message: requiredMessage(form$.impactOther) }
                        : undefined
                    },
                  }}
                >
                  {(field) => <field.TextareaField label={form$.impactOther} rows={3} />}
                </form.AppField>
              ) : null
            }
          </form.Subscribe>
        </Section>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onDone}>
        <form.AppForm>
          <form.SubmitButton
            label={request ? copy.resubmit : copy.submit}
            pendingLabel={copy.submitting}
          />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}

function requiredMessage(label: string) {
  return requiredText(label).safeParse('').error?.issues[0]?.message ?? label
}

function detailLabel(reason: string) {
  return reason === 'backfill' ? form$.backfillWho : form$.otherReason
}

function urgencyHint(urgency: string) {
  const hints: Record<string, string> = copy.urgencyHints

  return hints[urgency]
}

// What the plan fills in, so the requester sees it without retyping it.
function PlanLineSummary({ line, requestId }: { line: ApprovedPlanLine; requestId?: Uuid }) {
  const left = hiresLeft(line, requestId)

  const items = [
    [form$.roleName, line.roleName],
    [form$.department, line.departments?.name],
    [form$.level, line.job_levels?.name],
    [form$.employmentType, optionLabel('employmentType', line.employmentType)],
    [form$.planBudget, formatMoney(line.budgetAmount, line.currency ?? 'USD')],
    [form$.numberOfHires, form$.planHeadcount(left, line.approvedHeadcount ?? 0)],
  ] as const

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{form$.fromPlan}</p>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate">{value || '–'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
