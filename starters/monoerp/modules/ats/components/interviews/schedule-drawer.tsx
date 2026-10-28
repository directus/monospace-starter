import { useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Mail, RefreshCw, Video } from 'lucide-react'
import { useState } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { ownerOption } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'
import { AvailabilityStrip } from '@/modules/ats/components/interviews/availability-strip'
import {
  candidateName,
  combineDateTime,
  currentStageOf,
  defaultInterviewStart,
  fillTemplate,
  isInterviewStage,
  localDateInput,
  localTimeInput,
  placeholderMeetUrl,
  readyToInterview,
  errorMessages,
} from '@/modules/ats/components/interviews/interview-helpers'
import { InterviewerPicker } from '@/modules/ats/components/interviews/interviewer-picker'
import { candidateApplicationsQuery, fetchEmailTemplate } from '@/modules/ats/data/interviews'
import type { CandidateApplication, InterviewRow } from '@/modules/ats/data/interviews'
import { useScheduleInterview, useUpdateInterview } from '@/modules/ats/mutations/interviews'
import type { OutgoingMessage } from '@/modules/ats/mutations/interviews'

const copy = atsCopy.interviews.schedule

const DURATIONS = [15, 30, 45, 60, 90, 120]

const durationOptions = DURATIONS.map((minutes) => ({
  value: String(minutes),
  label: copy.minutes(minutes),
}))

const longDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

const clockTime = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

function templateQuery() {
  return {
    queryKey: ['emailTemplates', 'name', atsCopy.interviews.messages.templateName],
    queryFn: () => fetchEmailTemplate(atsCopy.interviews.messages.templateName),
    staleTime: 5 * 60_000,
  }
}

// Schedules a new interview for a candidate, or edits one (`interview`).
export function ScheduleInterviewDrawer({
  open,
  onOpenChange,
  candidateId,
  interview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidateId: Uuid
  interview?: InterviewRow
}) {
  const applications = useQuery({ ...candidateApplicationsQuery(candidateId), enabled: open })

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={interview ? copy.editTitle : copy.title}
    >
      {applications.isPending ? (
        <div className="p-5">
          <DataLoading rows={6} />
        </div>
      ) : applications.isError ? (
        <div className="p-5">
          <DataError error={applications.error} />
        </div>
      ) : applications.data.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">{copy.noApplications}</p>
      ) : (
        <ScheduleForm
          key={interview?.id ?? 'new'}
          applications={applications.data}
          interview={interview}
          onDone={() => onOpenChange(false)}
        />
      )}
    </FormDrawer>
  )
}

type Values = {
  applicationId: string
  stageId: string
  title: string
  interviewers: Array<RelationOption>
  date: string
  time: string
  duration: string
  meetingUrl: string
}

function initialValues(
  applications: Array<CandidateApplication>,
  interview?: InterviewRow,
): Values {
  if (interview) {
    const start = new Date(interview.startsAt ?? Date.now())

    const minutes = Math.round(
      (new Date(interview.endsAt ?? start).getTime() - start.getTime()) / 60_000,
    )

    return {
      applicationId: interview.applicationId ?? '',
      stageId: interview.interviewStageId ?? '',
      title: interview.title ?? '',
      interviewers: interview.participants.flatMap((participant): Array<RelationOption> => {
        const option = ownerOption(participant.user)

        return option ? [option] : [{ value: participant.userId, label: appCopy.fallback.unknown }]
      }),
      date: localDateInput(start),
      time: localTimeInput(start),
      duration: String(minutes > 0 ? minutes : 45),
      meetingUrl: interview.meetingUrl ?? placeholderMeetUrl(),
    }
  }

  // Default to the most recent job that's mid-interviews, at its current stage. A job sitting at
  // offer or later gets no stage suggested.
  const application =
    applications.find(readyToInterview) ??
    applications.find((item) => item.status === 'active') ??
    applications[0]

  const current = currentStageOf(application)
  const stage = isInterviewStage(current?.kind) ? current : undefined
  const start = defaultInterviewStart()

  return {
    applicationId: application?.id ?? '',
    stageId: stage?.id ?? '',
    title: stage?.name ?? '',
    interviewers: [],
    date: localDateInput(start),
    time: localTimeInput(start),
    duration: '45',
    meetingUrl: placeholderMeetUrl(),
  }
}

function slot(values: Pick<Values, 'date' | 'time' | 'duration'>) {
  const start = combineDateTime(values.date, values.time)

  return start
    ? { start, end: new Date(start.getTime() + Number(values.duration) * 60_000) }
    : { start: null, end: null }
}

// "Oct 16, 2026, 10:00 AM – 10:45 AM", so a duration change reads as a change.
function formatSlot(start: Date | null, end: Date | null) {
  if (!start) return ''

  return end
    ? `${formatDateTime(start.toISOString())} – ${clockTime.format(end)}`
    : formatDateTime(start.toISOString())
}

const names = (people: Array<RelationOption>) => people.map((person) => person.label).join(', ')

// What an edit changes, in the words the candidate's email uses.
function describeChanges(before: Values, after: Values, stageName: (id: string) => string) {
  const changes: Array<string> = []
  const was = slot(before)
  const now = slot(after)

  if (before.stageId !== after.stageId) {
    changes.push(
      atsCopy.interviews.change.stage(stageName(before.stageId), stageName(after.stageId)),
    )
  }

  if (before.title.trim() !== after.title.trim()) {
    changes.push(atsCopy.interviews.change.title(before.title, after.title.trim()))
  }

  if (was.start?.getTime() !== now.start?.getTime() || was.end?.getTime() !== now.end?.getTime()) {
    changes.push(
      atsCopy.interviews.change.when(
        formatSlot(was.start, was.end),
        formatSlot(now.start, now.end),
      ),
    )
  }

  const beforeIds = new Set(before.interviewers.map((person) => person.value))
  const afterIds = new Set(after.interviewers.map((person) => person.value))
  const added = after.interviewers.filter((person) => !beforeIds.has(person.value))
  const removed = before.interviewers.filter((person) => !afterIds.has(person.value))

  if (added.length) changes.push(atsCopy.interviews.change.added(names(added)))

  if (removed.length) changes.push(atsCopy.interviews.change.removed(names(removed)))

  if (before.meetingUrl !== after.meetingUrl) changes.push(atsCopy.interviews.change.meeting)

  return { changes, added, removed }
}

function ScheduleForm({
  applications,
  interview,
  onDone,
}: {
  applications: Array<CandidateApplication>
  interview?: InterviewRow
  onDone: () => void
}) {
  const me = useCurrentUser()
  const template = useQuery(templateQuery())
  const schedule = useScheduleInterview()
  const update = useUpdateInterview()
  const [submitError, setSubmitError] = useState<string>()
  const [initial] = useState(() => initialValues(applications, interview))

  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      const application = applications.find((item) => item.id === value.applicationId)
      const { start, end } = slot(value)

      if (!application || !start || !end) return

      const candidate = application.candidates
      const stage = application.stages.find((item) => item.id === value.stageId)

      const details = {
        title: value.title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        meetingUrl: value.meetingUrl,
        // SAFETY: stage options come from the job's interview_stages ids.
        stageId: (stage?.id ?? null) as Uuid | null,
      }

      try {
        if (interview) {
          const { changes, added, removed } = describeChanges(initial, value, stageLabel)

          const message: OutgoingMessage | null =
            changes.length && candidate?.id
              ? {
                  candidateId: candidate.id,
                  subject: atsCopy.interviews.messages.updatedSubject(details.title),
                  body: atsCopy.interviews.messages.updatedBody(
                    candidate.firstName ?? '',
                    changes,
                    `${longDate.format(start)}, ${clockTime.format(start)}`,
                    value.meetingUrl,
                  ),
                }
              : null

          await update.mutateAsync({
            id: interview.id,
            interview: details,
            addUserIds: added.map((person) => person.value),
            removeUserIds: removed.map((person) => person.value),
            message,
          })
        } else {
          if (!candidate?.id) return

          const fill = {
            candidate_first_name: candidate.firstName ?? '',
            candidate_last_name: candidate.lastName ?? '',
            candidate_name: candidateName(candidate),
            company_name: atsCopy.interviews.messages.company,
            job_title: application.requisitions?.title ?? '',
            position: application.requisitions?.title ?? '',
            interview_stage: stage?.name ?? details.title,
            interview_title: details.title,
            interviewer_names: names(value.interviewers),
            interview_date: longDate.format(start),
            interview_time: clockTime.format(start),
            meeting_url: value.meetingUrl,
            recruiter_name: me?.fullName ?? me?.email ?? '',
          }

          await schedule.mutateAsync({
            applicationId: application.id,
            interview: details,
            interviewerIds: value.interviewers.map((person) => person.value),
            message: {
              candidateId: candidate.id,
              subject: fillTemplate(
                template.data?.subject ?? atsCopy.interviews.messages.fallbackSubject,
                fill,
              ),
              body: fillTemplate(
                template.data?.body ?? atsCopy.interviews.messages.fallbackBody,
                fill,
              ),
            },
          })
        }

        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const values = useStore(form.store, (state) => state.values)
  const application = applications.find((item) => item.id === values.applicationId)

  function stageLabel(id: string) {
    return (
      applications.flatMap((item) => item.stages).find((stage) => stage.id === id)?.name ??
      appCopy.fallback.none
    )
  }

  const applicationOptions = applications.map((item) => ({
    value: item.id,
    label: item.requisitions?.title ?? appCopy.fallback.unknown,
  }))

  const currentStage = interview ? undefined : currentStageOf(application)

  const stageOptions = (application?.stages ?? []).map((stage) => ({
    value: stage.id,
    label: stage.name ?? '',
  }))

  const { start, end } = slot(values)
  const edits = interview ? describeChanges(initial, values, stageLabel).changes : []

  return (
    <DrawerForm form={form}>
      <DrawerFormBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="applicationId"
            validators={{ onSubmit: requiredText(copy.application) }}
            listeners={{
              onChange: ({ value }) => {
                const current = currentStageOf(applications.find((item) => item.id === value))
                const stage = isInterviewStage(current?.kind) ? current : undefined
                form.setFieldValue('stageId', stage?.id ?? '')
                form.setFieldValue('title', stage?.name ?? '')
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label={copy.application}
                options={applicationOptions}
                placeholder={copy.selectApplication}
                disabled={Boolean(interview) || applications.length === 1}
              />
            )}
          </form.AppField>
          <form.AppField
            name="stageId"
            listeners={{
              onChange: ({ value }) => {
                // Follow the stage name unless the title was typed by hand.
                const title = form.getFieldValue('title').trim()

                const names = new Set([
                  '',
                  ...(application?.stages ?? []).map((stage) => stage.name),
                ])

                if (names.has(title)) form.setFieldValue('title', stageLabel(value))
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label={copy.stage}
                options={stageOptions}
                placeholder={copy.selectStage}
                hint={
                  currentStage && !isInterviewStage(currentStage.kind)
                    ? copy.notInterviewStage(currentStage.name ?? '')
                    : undefined
                }
              />
            )}
          </form.AppField>
          <form.AppField
            name="title"
            validators={{
              onBlur: requiredText(copy.interviewTitle),
              onSubmit: requiredText(copy.interviewTitle),
            }}
          >
            {(field) => <field.TextField label={copy.interviewTitle} className="sm:col-span-2" />}
          </form.AppField>
        </div>

        <form.Field
          name="interviewers"
          validators={{
            onSubmit: ({ value }) =>
              value.length ? undefined : { message: copy.interviewersRequired },
          }}
        >
          {(field) => {
            const errors = errorMessages(field.state.meta.errors)

            return (
              <Field className="gap-1.5" data-invalid={errors.length > 0}>
                <FieldLabel htmlFor="field-interviewers">{copy.interviewers}</FieldLabel>
                <InterviewerPicker
                  id="field-interviewers"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  invalid={errors.length > 0}
                />
                <FieldError className="text-xs" errors={errors} />
              </Field>
            )
          }}
        </form.Field>

        <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
          <form.AppField name="date" validators={{ onSubmit: requiredText(copy.date) }}>
            {(field) => <field.TextField label={copy.date} type="date" />}
          </form.AppField>
          <form.AppField name="time" validators={{ onSubmit: requiredText(copy.start) }}>
            {(field) => <field.TextField label={copy.start} type="time" step={300} />}
          </form.AppField>
          <form.AppField name="duration">
            {(field) => <field.SelectField label={copy.duration} options={durationOptions} />}
          </form.AppField>
        </div>

        <AvailabilityStrip
          people={values.interviewers}
          date={values.date}
          start={start}
          end={end}
        />

        <form.Field name="meetingUrl">
          {(field) => (
            <Field className="gap-1.5">
              <FieldLabel htmlFor="field-meetingUrl">{copy.meeting}</FieldLabel>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Video className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="field-meetingUrl"
                    value={field.state.value}
                    readOnly
                    className="pl-8 font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => field.handleChange(placeholderMeetUrl())}
                >
                  <RefreshCw data-icon="inline-start" />
                  {copy.regenerate}
                </Button>
              </div>
              <FieldDescription className="text-xs">{copy.meetingHint}</FieldDescription>
            </Field>
          )}
        </form.Field>

        {interview ? (
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">{copy.changes}</p>
            {edits.length ? (
              <ul className="space-y-0.5 text-sm">
                {edits.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{copy.noChanges}</p>
            )}
            <p className="text-xs text-muted-foreground">{copy.changesHint}</p>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Mail className="mt-0.5 size-3.5 shrink-0" />
            {copy.confirmation}
          </p>
        )}
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onDone}>
        <form.AppForm>
          <form.SubmitButton
            label={interview ? appCopy.form.save : copy.submit}
            pendingLabel={interview ? appCopy.form.saving : copy.submitting}
          />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
