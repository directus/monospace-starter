import { noop, useQuery } from '@tanstack/react-query'

import { Property, InlineText } from '@/components/inline/inline-field'
import { isMissingFromWorkspace } from '@/lib/errors'
import type {
  OrganizationPanelContribution,
  OrganizationPanelProps,
  ContactPanelContribution,
  ContactPanelProps,
  DealSummaryContribution,
} from '@/modules/crm/slots'
import type { RecordHistoryEntry } from '@/modules/types'

import { PortalUserSummary } from './contact-summary'
import { portalAccountQuery, portalUserQuery, portalSummaryQuery } from './data'
import { CurrentPlan } from './deal-summary'
import type { PortalEvent } from './portal'
import { PortalEventRow } from './portal-event-row'
import { PortalPanel } from './portal-panel'
import { PortalUserPanel } from './portal-user-panel'
import { portalCopy } from './portal.copy'

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

function OrganizationPortal({ organization, onAddContact }: OrganizationPanelProps) {
  const portalAccountId = organization?.portalAccountId
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

function DealSummary({ organization }: OrganizationPanelProps) {
  const portalAccountId = organization?.portalAccountId
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

      return historyEntries(
        (await client.query({ ...query, staleTime: 'static' }))?.events?.data ?? [],
      )
    },
  }),
  prefetch: (client, { email }) => {
    if (email) void client.query(portalUserQuery(email)).catch(noop)
  },
}

export const dealSummary: DealSummaryContribution = {
  id: 'portal',
  title: portalCopy.organizations.currentPlan,
  component: DealSummary,
  prefetch: (client, { organization }) => {
    const portalAccountId = organization?.portalAccountId

    if (portalAccountId) void client.query(portalSummaryQuery(portalAccountId)).catch(noop)
  },
}

export default {
  id: 'portal',
  title: portalCopy.organizations.portal.tab,
  component: OrganizationPortal,
  detailField: ({ organization, canUpdate, onSave }) => (
    <Property label={portalCopy.organizations.accountId} readOnly={!canUpdate('portalAccountId')}>
      <InlineText
        label={portalCopy.organizations.accountId}
        value={organization.portalAccountId}
        inputClassName="font-mono text-xs"
        format={(value) => <span className="font-mono text-xs">{value}</span>}
        onSave={(value) => onSave({ portalAccountId: value })}
      />
    </Property>
  ),
  historyQuery: ({ organization }) => ({
    queryKey: ['organizations', 'portal-history', organization?.id],
    enabled: Boolean(organization?.portalAccountId),
    queryFn: async ({ client }) => {
      const query = portalAccountQuery(organization?.portalAccountId)

      return historyEntries(
        (await client.query({ ...query, staleTime: 'static' }))?.events?.data ?? [],
      )
    },
  }),
  prefetch: (client, { organization }) => {
    const portalAccountId = organization?.portalAccountId

    if (portalAccountId) void client.query(portalAccountQuery(portalAccountId)).catch(noop)
  },
} satisfies OrganizationPanelContribution
