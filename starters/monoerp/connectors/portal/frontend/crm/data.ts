import { queryOptions } from '@tanstack/react-query'
import { isMissingFromWorkspace } from '@/lib/errors'
import { monospace } from '@/lib/monospace'

const RELATED_LIMIT = 100

const PORTAL_USERS_LIMIT = 500

// The portal account as the list and the deal page see it: current subscription, seat count,
// open tickets.
const PORTAL_SUBSCRIPTION_INCLUDE = {
  subscriptions: {
    fields: ['id', 'status', 'seats', 'startedAt', 'renewsAt', 'canceledAt'],
    include: { plan: { fields: ['id', 'code', 'name', 'seatsIncluded', 'monthlyPrice'] } },
    sort: [{ startedAt: { direction: 'desc' } }],
    limit: 1,
  },
} as const

const PORTAL_SUMMARY_INCLUDE = {
  ...PORTAL_SUBSCRIPTION_INCLUDE,
  users: { fields: ['id'], limit: PORTAL_USERS_LIMIT },
  tickets: { fields: ['id', 'status'], filter: { status: 'open' }, limit: RELATED_LIMIT },
} as const

function readPortalSummaries(ids: Array<string>) {
  return monospace.accounts.readMany({
    fields: ['id', 'status'],
    include: PORTAL_SUMMARY_INCLUDE,
    filter: { id: { _in: ids } },
    limit: ids.length,
  })
}

export type PortalSummary = Awaited<ReturnType<typeof readPortalSummaries>>[number]

// Portal data comes from the other team's MySQL in its own request, never folded into a CRM
// read: when MySQL is down, a CRM request that includes it fails whole. Returns undefined when
// the portal can't be reached, so callers show the CRM half and mark the portal part missing.
async function portalSummaries(ids: ReadonlyArray<string | null | undefined>) {
  const wanted = [...new Set(ids)].flatMap((id) => (id ? [id] : []))
  const byId = new Map<string, PortalSummary>()

  if (!wanted.length) return byId

  try {
    for (const account of await readPortalSummaries(wanted)) {
      if (account.id) byId.set(account.id, account)
    }

    return byId
  } catch (error) {
    // A workspace without the portal has no portal data to show, which isn't an outage.
    return error instanceof Error && isMissingFromWorkspace(error) ? byId : undefined
  }
}

export function portalSummaryQuery(accountId: string | null | undefined) {
  return queryOptions({
    queryKey: ['organizations', 'portal-summary', accountId],
    queryFn: async () => (await readPortalSummaries([accountId ?? '']))[0] ?? null,
    enabled: Boolean(accountId),
  })
}

// The organization's account in the customer portal, loaded on its own so the CRM half of
// the page still renders when the portal's MySQL is unreachable.
async function fetchPortalAccount(accountId: string) {
  return monospace.accounts.readOne({
    key: accountId,
    fields: ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt'],
    include: {
      ...PORTAL_SUBSCRIPTION_INCLUDE,
      users: {
        fields: ['id', 'email', 'name', 'role', 'status', 'lastLoginAt'],
        include: { contacts: { fields: ['id'] } },
        sort: [{ lastLoginAt: { direction: 'desc' } }],
        limit: PORTAL_USERS_LIMIT,
      },
      tickets: {
        fields: ['id', 'subject', 'body', 'status', 'priority', 'openedAt', 'resolvedAt'],
        include: {
          user: { fields: ['id', 'name', 'email'], include: { contacts: { fields: ['id'] } } },
        },
        sort: [{ openedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      events: {
        fields: ['id', 'type', 'detail', 'occurredAt'],
        include: { user: { fields: ['id', 'name'] } },
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })
}

export type PortalAccount = Awaited<ReturnType<typeof fetchPortalAccount>>

export function portalAccountQuery(accountId: string | null | undefined) {
  return queryOptions({
    queryKey: ['organizations', 'portal', accountId],
    queryFn: () => fetchPortalAccount(accountId ?? ''),
    enabled: Boolean(accountId),
  })
}

// The contact's own login in the customer portal, matched by email (the same match as the
// `contacts.portalUser` relation). Loaded on its own for the same reason as the account: the
// CRM half of the page never waits on MySQL.
async function fetchPortalUser(email: string) {
  const [user] = await monospace.users.readMany({
    filter: { email },
    limit: 1,
    fields: ['id', 'email', 'name', 'role', 'status', 'lastLoginAt', 'createdAt', 'updatedAt'],
    include: {
      account: {
        fields: ['id', 'name', 'status'],
        include: { ...PORTAL_SUBSCRIPTION_INCLUDE, organization: { fields: ['id', 'name'] } },
      },
      tickets: {
        fields: ['id', 'subject', 'body', 'status', 'priority', 'openedAt', 'resolvedAt'],
        sort: [{ openedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      events: {
        fields: ['id', 'type', 'detail', 'occurredAt'],
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return user ?? null
}

export type PortalUser = NonNullable<Awaited<ReturnType<typeof fetchPortalUser>>>

export function portalUserQuery(email: string | null | undefined) {
  return queryOptions({
    queryKey: ['contacts', 'portal', email],
    queryFn: () => fetchPortalUser(email ?? ''),
    enabled: Boolean(email),
  })
}

export function portalSummariesQuery(ids: ReadonlyArray<string | null | undefined>) {
  return queryOptions({
    queryKey: ['organizations', 'portal-summaries', ids],
    queryFn: () => portalSummaries(ids),
  })
}
