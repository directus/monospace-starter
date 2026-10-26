import { useQuery } from '@tanstack/react-query'

import type { OrganizationPanelContribution, OrganizationPanelProps } from '@/modules/types'

import { BillingPanel } from './billing-panel'
import { billingCopy } from './billing.copy'
import { billingQuery } from './data'

function OrganizationBilling({ portalAccountId }: OrganizationPanelProps) {
  const billing = useQuery(billingQuery(portalAccountId))

  return (
    <BillingPanel
      connected={Boolean(portalAccountId)}
      customer={billing.data}
      pending={billing.isPending && billing.fetchStatus !== 'idle'}
      error={billing.error}
      onRetry={() => billing.refetch()}
    />
  )
}

export default {
  id: 'stripe-billing',
  title: billingCopy.tab,
  component: OrganizationBilling,
} satisfies OrganizationPanelContribution
