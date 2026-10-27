import { formatDate } from '@/lib/format'
import { portalCopy } from './portal.copy'
import { currentSubscription, seatUsage, renewalContext } from './portal'
import type { PortalAccountSummary } from './portal'

// The organization's plan in the customer portal, so the rep knows what they're selling
// against: plan, seats used, and when it renews.
export function CurrentPlan({
  account,
  loading,
  unavailable,
}: {
  account: PortalAccountSummary | null | undefined
  loading: boolean
  unavailable: boolean
}) {
  const subscription = currentSubscription(account)

  if (loading) return null

  if (unavailable) {
    return (
      <span className="text-muted-foreground">{portalCopy.organizations.portal.unavailable}</span>
    )
  }

  if (!subscription) {
    return <span className="text-muted-foreground">{portalCopy.organizations.notConnected}</span>
  }

  const seats = seatUsage(account)
  const renewal = renewalContext(subscription)
  const portal = portalCopy.organizations.portal

  return (
    <span>
      {subscription.plan?.name ?? portal.noPlan}
      {seats ? ` · ${portal.seatUsage(seats.used, seats.total)} ${portal.seats.toLowerCase()}` : ''}
      {renewal ? (
        <span
          className={
            renewal.tone === 'warn'
              ? 'block text-xs text-warning'
              : 'block text-xs text-muted-foreground'
          }
        >
          {subscription.renewsAt ? `${formatDate(subscription.renewsAt)} · ` : ''}
          {renewal.label}
        </span>
      ) : null}
    </span>
  )
}
