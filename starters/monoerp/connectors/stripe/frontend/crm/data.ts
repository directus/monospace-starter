import { queryOptions } from '@tanstack/react-query'

import { monospace } from '@/lib/monospace'

// Stripe bills the portal account (accounts.stripeCustomer), so billing is reached through it.
// Loaded on its own like the account, so a Stripe outage only costs the Billing tab. Stripe
// can't sum, so the page adds up the charges: a hundred covers years of monthly billing.
const STRIPE_CHARGES_LIMIT = 100

async function fetchBilling(accountId: string) {
  const account = await monospace.accounts.readOne({
    key: accountId,
    fields: ['id'],
    include: {
      stripeCustomer: {
        fields: ['id', 'name', 'email', 'created'],
        include: {
          charges: {
            fields: ['id', 'amount', 'currency', 'status', 'description', 'created'],
            sort: [{ created: { direction: 'desc' } }],
            limit: STRIPE_CHARGES_LIMIT,
          },
        },
      },
    },
  })

  return account.stripeCustomer ?? null
}

export type StripeCustomer = NonNullable<Awaited<ReturnType<typeof fetchBilling>>>

export function billingQuery(accountId: string | null | undefined) {
  return queryOptions({
    queryKey: ['billing', accountId],
    queryFn: () => fetchBilling(accountId ?? ''),
    enabled: Boolean(accountId),
  })
}
