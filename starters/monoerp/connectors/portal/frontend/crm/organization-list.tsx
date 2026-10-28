import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CreditCard } from 'lucide-react'

import { dateField } from '@/components/filters/filter-date-editor'
import { optionsFrom } from '@/lib/format'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { OrganizationListContribution } from '@/modules/crm/slots'

import { portalSummariesQuery } from './data'
import { currentSubscription, seatUsage, renewalContext, openTicketCount } from './portal'
import { portalCopy } from './portal.copy'

const PLAN_OPTIONS = optionsFrom(portalCopy.plans)

function useSummary(
  accountId: string | null | undefined,
  accountIds: readonly (string | null | undefined)[],
) {
  const query = useQuery(portalSummariesQuery(accountIds))

  return {
    account: accountId ? query.data?.get(accountId) : null,
    unavailable: query.isSuccess && !query.data && Boolean(accountId),
  }
}

export const organizationList: OrganizationListContribution = {
  filters: [
    // Both live in the customer portal's MySQL; Monospace resolves the hop.
    {
      id: 'plan',
      label: portalCopy.organizations.portal.plan,
      type: 'select',
      kind: 'option',
      defaultOperator: 'is_any_of',
      searchable: false,
      icon: <CreditCard />,
      options: PLAN_OPTIONS,
      toClause: (clause) => ({
        portalAccount: { subscriptions: { _some: { plan: { code: clause } } } },
      }),
    },
    {
      ...dateField({
        id: 'renewsAt',
        label: portalCopy.organizations.portal.renews,
        icon: <CalendarDays />,
        defaultOperator: 'is_before',
      }),
      toClause: (clause) => ({ portalAccount: { subscriptions: { _some: { renewsAt: clause } } } }),
    },
  ],
  columns: [
    {
      before: 'updatedAt',
      id: 'plan',
      header: portalCopy.organizations.portal.plan,
      kind: 'text',
      component: ({ organization, organizations }) => {
        const { account, unavailable } = useSummary(
          organization.portalAccountId,
          organizations.map((row) => row.portalAccountId),
        )

        return unavailable ? (
          <span className="text-muted-foreground">
            {portalCopy.organizations.portal.unavailable}
          </span>
        ) : (
          (currentSubscription(account)?.plan?.name ?? '')
        )
      },
    },
    {
      before: 'updatedAt',
      id: 'seats',
      header: portalCopy.organizations.portal.seats,
      kind: 'number',
      meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
      component: ({ organization, organizations }) => {
        const { account } = useSummary(
          organization.portalAccountId,
          organizations.map((row) => row.portalAccountId),
        )

        const seats = seatUsage(account)

        if (!seats) return ''

        return (
          <span className={cn(seats.full && 'font-medium text-warning')}>
            {portalCopy.organizations.portal.seatUsage(seats.used, seats.total)}
          </span>
        )
      },
    },
    {
      before: 'updatedAt',
      id: 'renewsAt',
      header: portalCopy.organizations.portal.renews,
      kind: 'text',
      component: ({ organization, organizations }) => {
        const { account } = useSummary(
          organization.portalAccountId,
          organizations.map((row) => row.portalAccountId),
        )

        const subscription = currentSubscription(account)
        const renewal = renewalContext(subscription)

        if (!subscription || !renewal) return ''

        return (
          <span className={cn(renewal.tone === 'warn' && 'text-warning')}>
            {subscription.renewsAt ? `${formatDate(subscription.renewsAt)} · ` : ''}
            {renewal.label}
          </span>
        )
      },
    },
    {
      before: 'updatedAt',
      id: 'tickets',
      header: portalCopy.organizations.portal.openTickets,
      kind: 'number',
      meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
      component: ({ organization, organizations }) => {
        const { account } = useSummary(
          organization.portalAccountId,
          organizations.map((row) => row.portalAccountId),
        )

        const count = openTicketCount(account)

        if (!account) return ''

        return <span className={cn(count >= 3 && 'font-medium text-warning')}>{count}</span>
      },
    },
  ],
}
