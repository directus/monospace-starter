import { useQuery } from '@tanstack/react-query'

import { isMissingFromWorkspace } from '@/lib/errors'
import type { RecordHistoryEntry } from '@/modules/types'
import type {
  OrganizationPanelContribution,
  OrganizationPanelProps,
  ContactPanelContribution,
  ContactPanelProps,
  DealSummaryContribution,
} from '@/modules/crm/slots'

import { portalAccountQuery, portalUserQuery, portalSummaryQuery } from './data'
import { portalCopy } from './portal.copy'
import { PortalPanel } from './portal-panel'
import { PortalUserPanel } from './portal-user-panel'
import { PortalEventRow } from './portal-event-row'
import { PortalUserSummary } from './contact-summary'
import { CurrentPlan } from './deal-summary'
import type { PortalEvent } from './portal'

export { organizationList } from './organization-list'

function historyEntries(events: PortalEvent[]): RecordHistoryEntry[] {
  return events.flatMap((event) =>
    event.id && event.occurredAt
      ? [
          {
            id: `portal-${event.id}`,
            at: event.occurredAt,
            render: (when: string, inset?: string) => (
              <PortalEventRow event={event} when={when} inset={inset} />
            ),
          },
        ]
      : [],
  )
}

function OrganizationPortal({ portalAccountId, onAddContact }: OrganizationPanelProps) {
  const portal = useQuery(portalAccountQuery(portalAccountId))

  return (
    <PortalPanel
      connected={Boolean(portalAccountId)}
      account={portal.data}
      pending={portal.isPending && portal.fetchStatus !== 'idle'}
      error={portal.error}
      onRetry={() => portal.refetch()}
      onAddContact={onAddContact}
    />
  )
}

function ContactPortal({ email }: ContactPanelProps) {
  const portal = useQuery(portalUserQuery(email))

  return (
    <PortalUserPanel
      connected={Boolean(email) && !(portal.isSuccess && !portal.data)}
      user={portal.data}
      pending={portal.isPending && portal.fetchStatus !== 'idle'}
      error={portal.error}
      onRetry={() => portal.refetch()}
    />
  )
}

function ContactSummary({ email }: ContactPanelProps) {
  const portal = useQuery(portalUserQuery(email))

  return (
    <PortalUserSummary user={portal.data} loading={portal.isLoading} unavailable={portal.isError} />
  )
}

function DealSummary({ portalAccountId }: OrganizationPanelProps) {
  const portal = useQuery(portalSummaryQuery(portalAccountId))

  return (
    <CurrentPlan
      account={portal.data}
      loading={portal.isLoading}
      unavailable={portal.isError && !isMissingFromWorkspace(portal.error)}
    />
  )
}

export const contactPanel: ContactPanelContribution = {
  id: 'portal',
  title: portalCopy.contacts.portal.tab,
  summaryTitle: portalCopy.contacts.portalUser,
  component: ContactPortal,
  summary: ContactSummary,
  historyQuery: ({ email }) => ({
    queryKey: ['contacts', 'portal-history', email],
    enabled: Boolean(email),
    queryFn: async ({ client }) => {
      const query = portalUserQuery(email)

      return historyEntries((await client.ensureQueryData(query))?.events?.data ?? [])
    },
  }),
}

export const dealSummary: DealSummaryContribution = {
  id: 'portal',
  title: portalCopy.organizations.currentPlan,
  component: DealSummary,
}

export default {
  id: 'portal',
  title: portalCopy.contacts.portal.tab,
  component: OrganizationPortal,
  historyQuery: ({ portalAccountId }) => ({
    queryKey: ['organizations', 'portal-history', portalAccountId],
    enabled: Boolean(portalAccountId),
    queryFn: async ({ client }) => {
      const query = portalAccountQuery(portalAccountId)

      return historyEntries((await client.ensureQueryData(query))?.events?.data ?? [])
    },
  }),
} satisfies OrganizationPanelContribution
