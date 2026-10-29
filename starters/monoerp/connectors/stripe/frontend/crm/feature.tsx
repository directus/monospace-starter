import { noop, useQuery } from '@tanstack/react-query'

import type { OrganizationPanelContribution, OrganizationPanelProps } from '@/modules/crm/slots'

import { BillingPanel } from './billing-panel'
import { billingCopy } from './billing.copy'
import { billingQuery } from './data'

function OrganizationBilling({ organization }: OrganizationPanelProps) {
  const portalAccountId = organization?.portalAccountId
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
  // Billing is a tab, but Stripe is slow enough that starting with the page makes the tab instant.
  prefetch: (client, { organization }) => {
    const portalAccountId = organization?.portalAccountId

    if (portalAccountId) void client.query(billingQuery(portalAccountId)).catch(noop)
  },
} satisfies OrganizationPanelContribution
