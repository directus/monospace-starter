import { parseDate } from '@/lib/format'
import { portalCopy } from './portal.copy'

// Shapes shared by every query that includes the portal account (list rows, the organization
// page, the deal page). Structural so each query can pick its own fields.
export type PortalSubscription = {
  status?: string | null
  seats?: number | null
  renewsAt?: string | null
  plan?: { name?: string | null; code?: string | null; monthlyPrice?: string | null } | null
}

export type PortalEvent = {
  id?: string | null
  type?: string | null
  detail?: string | null
  occurredAt?: string | null
  user?: { name?: string | null } | null
}

export type PortalAccountSummary = {
  status?: string | null
  subscriptions?: { data: Array<PortalSubscription> } | null
  users?: { data: Array<unknown> } | null
  tickets?: { data: Array<{ status?: string | null }> } | null
}

const copy = portalCopy.organizations.portal

const DAY_MS = 86_400_000

export function currentSubscription(account: PortalAccountSummary | null | undefined) {
  return account?.subscriptions?.data[0] ?? null
}

export function seatUsage(account: PortalAccountSummary | null | undefined) {
  const seats = currentSubscription(account)?.seats
  const users = account?.users?.data

  if (seats == null || !users) return null

  return { used: users.length, total: seats, full: users.length >= seats }
}

export function openTicketCount(account: PortalAccountSummary | null | undefined) {
  return account?.tickets?.data.filter((ticket) => ticket.status === 'open').length ?? 0
}

export function durationLabel(days: number) {
  if (days < 1) return copy.today

  if (days < 60) return copy.days(days)

  if (days < 730) return copy.months(Math.round(days / 30))

  return copy.years(Math.round(days / 365))
}

// "Renews in 23 days", "Past due", "Trial ends in 4 days". `tone` drives the colour: `warn`
// for anything that needs a call this month.
export function renewalContext(
  subscription: PortalSubscription | null | undefined,
  now = Date.now(),
): { label: string; tone: 'normal' | 'warn' | 'muted' } | null {
  if (!subscription) return null

  if (subscription.status === 'canceled') return { label: copy.canceled, tone: 'muted' }

  if (subscription.status === 'past_due') return { label: copy.pastDue, tone: 'warn' }

  if (!subscription.renewsAt) return null
  const days = Math.ceil((parseDate(subscription.renewsAt).getTime() - now) / DAY_MS)
  const soon = days <= 90

  if (days < 0) return { label: copy.renewedAgo(durationLabel(-days)), tone: 'warn' }

  if (subscription.status === 'trialing') {
    return { label: `${copy.trialEnds} ${copy.renewsIn(durationLabel(days))}`, tone: 'warn' }
  }

  return { label: copy.renewsIn(durationLabel(days)), tone: soon ? 'warn' : 'normal' }
}

export function accountStatusLabel(status: string | null | undefined) {
  // SAFETY: unknown statuses miss the lookup and fall back to the raw value; Monospace types
  // select fields as string (docs/monospace.md, known issues).
  return (status && copy.accountStatuses[status as keyof typeof copy.accountStatuses]) || status
}

export function eventLabel(type: string | null | undefined) {
  // SAFETY: unknown event types miss the lookup and fall back to the raw value; see
  // docs/monospace.md, known issues.
  return (type && copy.events[type as keyof typeof copy.events]) || type || ''
}
