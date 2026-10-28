import { useQuery } from '@tanstack/react-query'
import { ArrowRight, History } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { DataError, DataLoading } from '@/components/data-state'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { formatDate, formatDateTime } from '@/lib/format'
import { usersById } from '@/lib/monospace-system'
import { isUuid } from '@/lib/uuid'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { candidateAuditQuery } from '@/modules/ats/data/candidates'
import type { AuditEvent, CandidateApplication } from '@/modules/ats/data/candidates'

const copy = atsCopy.candidates.history

const recordNames: Record<string, string> = copy.records

const fieldNames: Record<string, string> = copy.fields

const DAY = 86_400_000

const timeOnly = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

// The trigger writes {column: [old, new]} for whatever changed. Values arrive as JSON; they're
// shown as text, so booleans become Yes/No here and anything structured is left out.
const auditValue = z
  .union([
    z.string(),
    z.number().transform(String),
    z.boolean().transform((value) => (value ? copy.yes : copy.no)),
    z.null(),
  ])
  .catch(null)

const changesSchema = z.record(z.string(), z.tuple([auditValue, auditValue]))

type Change = { field: string; from: string | null; to: string | null }

function changesOf(event: AuditEvent): Array<Change> {
  const parsed = changesSchema.safeParse(event.changes)

  if (!parsed.success) return []

  return Object.entries(parsed.data)
    .filter(([field]) => !copy.hidden.includes(field))
    .map(([field, [from, to]]) => ({ field, from, to }))
}

// Same buckets as the CRM's history list (modules/crm/components/history-list.tsx): the last two
// weeks by closeness, older by month.
function bucketOf(iso: string, now: number) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const date = new Date(iso)
  const days = Math.floor((start.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / DAY)

  if (days <= 0) return { label: copy.today, dated: false }

  if (days === 1) return { label: copy.yesterday, dated: false }

  if (days < 7) return { label: copy.thisWeek, dated: true }

  if (days < 14) return { label: copy.lastWeek, dated: true }

  return { label: monthLabel.format(date), dated: true }
}

export type Names = {
  stages: Map<string, string>
  jobs: Map<string, string>
  users: Map<string, string>
}

function display(field: string, value: string | null | undefined, names: Names): string {
  if (!value) return copy.emptyValue

  if (field === 'interview_stage_id') return names.stages.get(value) ?? copy.unknownStage

  if (field === 'requisition_id') return names.jobs.get(value) ?? copy.unknownJob

  if (field.endsWith('_user_id')) return names.users.get(value) ?? copy.unknownUser

  if (field === 'source') return optionLabel('source', value)

  if (field === 'status') return optionLabel('applicationStatus', value)

  if (field === 'visibility') return optionLabel('visibility', value)

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)

  return value.length > 80 ? `${value.slice(0, 80)}…` : value
}

// What happened, in a sentence: "added a private note", "moved them to Hiring Manager Screen".
export function summary(event: AuditEvent, names: Names) {
  const record = recordNames[event.tableName ?? ''] ?? event.tableName ?? ''
  const changes = changesOf(event)
  const value = (field: string) => changes.find((change) => change.field === field)?.to

  if (event.action === 'insert') {
    if (event.tableName === 'candidates') return copy.createdProfile

    if (event.tableName === 'applications')
      return copy.addedToJob(display('requisition_id', value('requisition_id'), names))

    if (event.tableName === 'candidate_notes')
      return value('visibility') === 'private' ? copy.addedPrivateNote : copy.addedNote

    return copy.created(record)
  }

  if (event.action === 'delete') return copy.deleted(record)

  if (event.tableName === 'applications') {
    const stage = changes.find((change) => change.field === 'interview_stage_id')

    if (stage) return copy.movedTo(display('interview_stage_id', stage.to, names))

    if (value('status') === 'rejected') return copy.rejected

    if (value('status') === 'hired') return copy.hired
  }

  return copy.updated(record)
}

// The candidate's audit events, plus the names their ids point at (stages, jobs, people).
export function useCandidateAudit(candidateId: Uuid, applications: Array<CandidateApplication>) {
  const events = useQuery(candidateAuditQuery(candidateId))

  // Ids in changes (referrer, approver) resolve through the cached user lookup.
  const userIds = (events.data ?? []).flatMap((event) =>
    changesOf(event).flatMap(({ field, from, to }) =>
      field.endsWith('_user_id')
        ? [from, to].filter((id): id is Uuid => id !== null && isUuid(id))
        : [],
    ),
  )

  const users = useQuery({
    queryKey: ['auditEvents', 'users', [...new Set(userIds)].sort()],
    queryFn: () => usersById(userIds),
    enabled: userIds.length > 0,
  })

  const names: Names = {
    stages: new Map(
      applications.flatMap((application) =>
        application.stages.map((stage) => [stage.id, stage.name ?? ''] as const),
      ),
    ),
    jobs: new Map(
      applications.flatMap((application) =>
        application.requisitions?.id
          ? [[application.requisitions.id, application.requisitions.title ?? ''] as const]
          : [],
      ),
    ),
    users: new Map(
      [...(users.data?.entries() ?? [])].map(([id, user]) => [id, userName(user)] as const),
    ),
  }

  return { events, names }
}

export function HistoryPanel({
  candidateId,
  applications,
}: {
  candidateId: Uuid
  applications: Array<CandidateApplication>
}) {
  const { events, names } = useCandidateAudit(candidateId, applications)
  const [now] = useState(() => Date.now())

  if (events.isPending) return <DataLoading rows={4} />

  if (events.isError) return <DataError error={events.error} />

  if (!events.data.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <History className="size-6" />
        {copy.empty}
      </div>
    )
  }

  const groups: Array<{ label: string; dated: boolean; items: Array<AuditEvent> }> = []

  for (const event of events.data) {
    const bucket = bucketOf(event.occurredAt ?? '', now)
    const last = groups[groups.length - 1]

    if (last?.label === bucket.label) last.items.push(event)
    else groups.push({ ...bucket, items: [event] })
  }

  return (
    <div className="divide-y rounded-xl border">
      {groups.map((group) => (
        <section key={group.label}>
          <header className="sticky top-0 z-10 flex h-9 items-center rounded-t-xl border-b bg-background/95 px-4 backdrop-blur">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h3>
          </header>
          <ol className="divide-y">
            {group.items.map((event) => {
              const changes = event.action === 'update' ? changesOf(event) : []
              const at = new Date(event.occurredAt ?? '')

              return (
                <li key={event.id} className="flex gap-3 px-4 py-3">
                  <UserAvatar user={event.actorUser} size="sm" className="mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm">
                      <span className="font-medium">
                        {event.actorUser ? userName(event.actorUser) : copy.system}
                      </span>{' '}
                      <span className="text-muted-foreground">{summary(event, names)}</span>
                    </p>
                    {changes.length ? (
                      <ul className="space-y-1">
                        {changes.map((change) => (
                          <li
                            key={change.field}
                            className="flex flex-wrap items-center gap-x-1.5 text-xs"
                          >
                            <span className="text-muted-foreground">
                              {fieldNames[change.field] ?? change.field}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground line-through decoration-muted-foreground/50">
                              {display(change.field, change.from, names)}
                            </span>
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                              {display(change.field, change.to, names)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <time
                    dateTime={event.occurredAt ?? undefined}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {(group.dated ? dateTime : timeOnly).format(at)}
                  </time>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
