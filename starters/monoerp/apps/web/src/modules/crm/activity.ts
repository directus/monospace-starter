import type { RelationOption } from '@/components/form/relation-combobox'
import type { OwnerLike } from '@/lib/format'
import { ownerOption } from '@/lib/format'
import { crmCopy } from '@/modules/crm/crm.copy'
import { contactOption, organizationOption } from '@/modules/crm/entity-options'
import type { ActivityInitial } from '@/modules/crm/components/activity-form'
import type { Uuid } from '@/generated/monospace'

// The shape every interactions selection in data.ts satisfies, so one mapper serves all pages.
export type InteractionLike = {
  id?: Uuid | null
  type?: string | null
  status?: string | null
  direction?: string | null
  subject?: string | null
  body?: string | null
  occurredAt?: string | null
  dueAt?: string | null
  completedAt?: string | null
  ownerUserId?: string | null
  owner?: OwnerLike | null
  organizations?: { id?: Uuid | null; name?: string | null; domain?: string | null } | null
  contacts?: {
    id?: Uuid | null
    firstName?: string | null
    lastName?: string | null
    email?: string | null
  } | null
  opportunities?: { id?: Uuid | null; title?: string | null } | null
}

export function contactName(row: InteractionLike) {
  const name = `${row.contacts?.firstName ?? ''} ${row.contacts?.lastName ?? ''}`.trim()

  return name || null
}

export function isOpen(row: InteractionLike) {
  return row.status === 'open'
}

export function filterRelationOptions(options: Array<RelationOption>, q: string) {
  const query = q.trim().toLocaleLowerCase()

  if (!query) return options

  return options.filter(
    (option) =>
      option.label.toLocaleLowerCase().includes(query) ||
      option.description?.toLocaleLowerCase().includes(query),
  )
}

export type UpcomingBucket = 'overdue' | 'today' | 'week' | 'later' | 'noDate'

export const upcomingBuckets: Array<UpcomingBucket> = [
  'overdue',
  'today',
  'week',
  'later',
  'noDate',
]

const DAY = 86_400_000

export function upcomingBucket(row: InteractionLike, now: number): UpcomingBucket {
  const due = row.dueAt ?? row.occurredAt

  if (!due) return 'noDate'
  const time = new Date(due).getTime()
  const today = startOfToday(now)

  if (time < today) return 'overdue'

  if (time < today + DAY) return 'today'

  if (time < today + 7 * DAY) return 'week'

  return 'later'
}

export function countBuckets(rows: Array<InteractionLike>, now: number) {
  const counts: Record<UpcomingBucket, number> = {
    overdue: 0,
    today: 0,
    week: 0,
    later: 0,
    noDate: 0,
  }

  for (const row of rows) counts[upcomingBucket(row, now)] += 1

  return counts
}

function startOfToday(now: number) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

export function sortByDue<T extends InteractionLike>(rows: Array<T>) {
  return [...rows].sort((a, b) => {
    const da = a.dueAt ?? a.occurredAt
    const db = b.dueAt ?? b.occurredAt

    if (!da) return 1

    if (!db) return -1

    return new Date(da).getTime() - new Date(db).getTime()
  })
}

export function toActivityInitial(
  row: InteractionLike,
  fallback: { organization?: RelationOption; contact?: RelationOption; deal?: RelationOption } = {},
): ActivityInitial | null {
  if (!row.id) return null
  const organization = organizationOption(row.organizations) ?? fallback.organization
  const contact = contactOption(row.contacts) ?? fallback.contact

  const deal = row.opportunities?.id
    ? { value: row.opportunities.id, label: row.opportunities.title ?? crmCopy.deals.restricted }
    : fallback.deal

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    direction: row.direction,
    subject: row.subject,
    body: row.body,
    occurredAt: row.occurredAt,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    organization: organization ?? null,
    contact: contact ?? null,
    deal: deal ?? null,
    owner: ownerOption(row.owner),
  }
}
