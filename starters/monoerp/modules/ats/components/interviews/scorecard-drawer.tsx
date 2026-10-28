import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  candidateName,
  formatScorecardItems,
  parseScorecardItems,
  errorMessages,
} from '@/modules/ats/components/interviews/interview-helpers'
import type { ScorecardItem } from '@/modules/ats/components/interviews/interview-helpers'
import { RecommendationPicker } from '@/modules/ats/components/interviews/recommendation'
import type { InterviewRow } from '@/modules/ats/data/interviews'
import { useSaveScorecard } from '@/modules/ats/mutations/interviews'

const copy = atsCopy.interviews.scorecard

// Opens on one interviewer's scorecard for one interview: theirs to edit if it exists.
export function ScorecardDrawer({
  open,
  onOpenChange,
  interview,
  interviewerUserId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  interview: InterviewRow
  interviewerUserId?: Uuid | null
}) {
  const name = candidateName(interview.applications?.candidates)

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={name ? copy.newTitle(name) : copy.title}
      description={`${interview.title ?? ''} · ${formatDateTime(interview.startsAt)}`}
    >
      <ScorecardForm
        key={`${interview.id}-${interviewerUserId ?? ''}`}
        interview={interview}
        interviewerUserId={interviewerUserId}
        onDone={() => onOpenChange(false)}
      />
    </FormDrawer>
  )
}

type Values = {
  interviewerUserId: string
  recommendation: string
  summary: string
  positives: Array<ScorecardItem>
  flags: Array<ScorecardItem>
}

const blank = (): ScorecardItem => ({ point: '', evidence: '', mitigation: '' })

function ScorecardForm({
  interview,
  interviewerUserId,
  onDone,
}: {
  interview: InterviewRow
  interviewerUserId?: Uuid | null
  onDone: () => void
}) {
  const me = useCurrentUser()
  const save = useSaveScorecard()
  const [submitError, setSubmitError] = useState<string>()

  const owing = interview.participants.filter(
    (participant) =>
      !interview.scorecards.some((card) => card.interviewerUserId === participant.userId),
  )

  // Given, else me if I'm on it, else whoever still owes one.
  const initialInterviewer =
    interviewerUserId ??
    interview.participants.find((participant) => participant.userId === me?.id)?.userId ??
    owing[0]?.userId ??
    interview.participants[0]?.userId ??
    ''

  const cardFor = (userId: string) =>
    interview.scorecards.find((card) => card.interviewerUserId === userId)

  const valuesFor = (userId: string): Values => {
    const card = cardFor(userId)
    const positives = parseScorecardItems(card?.positives)
    const flags = parseScorecardItems(card?.flags)

    return {
      interviewerUserId: userId,
      recommendation: card?.recommendation ?? '',
      summary: card?.summary ?? '',
      positives: positives.length ? positives : [blank()],
      flags: flags.length ? flags : [blank()],
    }
  }

  const form = useAppForm({
    defaultValues: valuesFor(initialInterviewer),
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      try {
        await save.mutateAsync({
          id: cardFor(value.interviewerUserId)?.id,
          interviewId: interview.id,
          // SAFETY: the options are the interview's participant ids, which are uuids.
          interviewerUserId: value.interviewerUserId as Uuid,
          data: {
            recommendation: value.recommendation,
            summary: value.summary.trim() || null,
            positives: formatScorecardItems(value.positives),
            flags: formatScorecardItems(value.flags),
          },
        })
        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const interviewerOptions = interview.participants.map((participant) => ({
    value: participant.userId,
    label: userName(participant.user),
  }))

  return (
    <DrawerForm form={form}>
      <DrawerFormBody className="space-y-6">
        {interviewerOptions.length > 1 ? (
          <form.AppField
            name="interviewerUserId"
            listeners={{
              onChange: ({ value }) => {
                const next = valuesFor(value)
                form.setFieldValue('recommendation', next.recommendation)
                form.setFieldValue('summary', next.summary)
                form.setFieldValue('positives', next.positives)
                form.setFieldValue('flags', next.flags)
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label={copy.interviewer}
                options={interviewerOptions}
                placeholder={copy.selectInterviewer}
              />
            )}
          </form.AppField>
        ) : null}

        <form.Field
          name="recommendation"
          validators={{
            onSubmit: ({ value }) => (value ? undefined : { message: copy.recommendationRequired }),
          }}
        >
          {(field) => {
            const errors = errorMessages(field.state.meta.errors)

            return (
              <Field className="gap-2">
                <FieldLabel>{copy.recommendation}</FieldLabel>
                <RecommendationPicker
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  invalid={errors.length > 0}
                />
                <FieldError className="text-xs" errors={errors} />
              </Field>
            )
          }}
        </form.Field>

        <form.AppField name="summary">
          {(field) => (
            <field.TextareaField
              label={copy.summary}
              optional
              rows={4}
              placeholder={copy.summaryPlaceholder}
            />
          )}
        </form.AppField>

        <form.Field name="positives">
          {(field) => (
            <ItemsEditor
              label={copy.positives}
              hint={copy.positivesHint}
              itemLabel={copy.positive}
              placeholder={copy.positivePlaceholder}
              addLabel={copy.addPositive}
              items={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>

        <form.Field name="flags">
          {(field) => (
            <ItemsEditor
              label={copy.flags}
              hint={copy.flagsHint}
              itemLabel={copy.flag}
              placeholder={copy.flagPlaceholder}
              addLabel={copy.addFlag}
              items={field.state.value}
              onChange={field.handleChange}
              withMitigation
            />
          )}
        </form.Field>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onDone}>
        <form.AppForm>
          <form.Subscribe selector={(state) => state.values.interviewerUserId}>
            {(userId) => (
              <form.SubmitButton
                label={cardFor(userId) ? copy.update : copy.submit}
                pendingLabel={appCopy.form.saving}
              />
            )}
          </form.Subscribe>
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}

function ItemsEditor({
  label,
  hint,
  itemLabel,
  placeholder,
  addLabel,
  items,
  onChange,
  withMitigation = false,
}: {
  label: string
  hint: string
  itemLabel: string
  placeholder: string
  addLabel: string
  items: Array<ScorecardItem>
  onChange: (items: Array<ScorecardItem>) => void
  withMitigation?: boolean
}) {
  const update = (index: number, patch: Partial<ScorecardItem>) =>
    onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)))

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <FieldDescription className="-mt-1 text-xs">{hint}</FieldDescription>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`${itemLabel} ${index + 1}`}
                value={item.point}
                placeholder={placeholder}
                onChange={(event) => update(index, { point: event.target.value })}
                className="bg-background"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${atsCopy.interviews.scorecard.remove} ${itemLabel.toLowerCase()} ${index + 1}`}
                onClick={() =>
                  onChange(items.length > 1 ? items.filter((_, at) => at !== index) : [blank()])
                }
              >
                <X />
              </Button>
            </div>
            <Textarea
              aria-label={`${copy.evidence} ${index + 1}`}
              value={item.evidence}
              rows={2}
              placeholder={`${copy.evidence}: ${copy.evidencePlaceholder.toLowerCase()}`}
              onChange={(event) => update(index, { evidence: event.target.value })}
              className="min-h-14 bg-background"
            />
            {withMitigation ? (
              <Textarea
                aria-label={`${copy.mitigation} ${index + 1}`}
                value={item.mitigation}
                rows={2}
                placeholder={`${copy.mitigation}: ${copy.mitigationPlaceholder.toLowerCase()}`}
                onChange={(event) => update(index, { mitigation: event.target.value })}
                className="min-h-14 bg-background"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, blank()])}
      >
        <Plus data-icon="inline-start" />
        {addLabel}
      </Button>
    </fieldset>
  )
}
