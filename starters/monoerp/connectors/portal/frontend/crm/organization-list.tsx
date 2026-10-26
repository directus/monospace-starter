import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CreditCard } from 'lucide-react'
import { dateField } from '@/components/filter-date-editor'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { OrganizationListContribution } from '@/modules/types'
import { portalSummariesQuery } from './data'
import { portalCopy } from './portal.copy'
import { currentSubscription, seatUsage, renewalContext, openTicketCount } from './portal'

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter' },
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise' },
]

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
      id: 'plan',
      header: portalCopy.organizations.portal.plan,
      size: 130,
      component: ({ accountId, accountIds }) => {
        const { account, unavailable } = useSummary(accountId, accountIds)

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
      id: 'seats',
      header: portalCopy.organizations.portal.seats,
      size: 110,
      meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
      component: ({ accountId, accountIds }) => {
        const { account } = useSummary(accountId, accountIds)
        const seats = seatUsage(account)

        if (!seats) return ''

        return (
          <span className={cn(seats.full && 'font-medium text-amber-700 dark:text-amber-400')}>
            {portalCopy.organizations.portal.seatUsage(seats.used, seats.total)}
          </span>
        )
      },
    },
    {
      id: 'renewsAt',
      header: portalCopy.organizations.portal.renews,
      size: 170,
      component: ({ accountId, accountIds }) => {
        const { account } = useSummary(accountId, accountIds)
        const subscription = currentSubscription(account)
        const renewal = renewalContext(subscription)

        if (!subscription || !renewal) return ''

        return (
          <span className={cn(renewal.tone === 'warn' && 'text-amber-700 dark:text-amber-400')}>
            {subscription.renewsAt ? `${formatDate(subscription.renewsAt)} · ` : ''}
            {renewal.label}
          </span>
        )
      },
    },
    {
      id: 'tickets',
      header: portalCopy.organizations.portal.openTickets,
      size: 120,
      meta: { headerClassName: 'justify-end', cellClassName: 'text-right tabular-nums' },
      component: ({ accountId, accountIds }) => {
        const { account } = useSummary(accountId, accountIds)
        const count = openTicketCount(account)

        if (!account) return ''

        return (
          <span className={cn(count >= 3 && 'font-medium text-amber-700 dark:text-amber-400')}>
            {count}
          </span>
        )
      },
    },
  ],
}
