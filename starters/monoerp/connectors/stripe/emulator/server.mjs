// A local Stripe for the stack: @emulators/stripe (https://www.npmjs.com/package/@emulators/stripe), seeded at start with the billing that
// matches the customer portal (billing.json). It keeps everything in memory, so writes last until
// the container restarts, like a test-mode account you reset.
import { readFileSync } from 'node:fs'

import { createServer, serve } from '@emulators/core'
import { getStripeStore, seedFromConfig, stripePlugin } from '@emulators/stripe'

const port = Number(process.env.PORT ?? 4010)

const billing = JSON.parse(readFileSync(new URL('billing.json', import.meta.url), 'utf8'))

const { app, store } = createServer(stripePlugin, { port, baseUrl: `http://localhost:${port}` })

const stripe = getStripeStore(store)

const productId = (plan) => `prod_MonoErp${capitalize(plan.code)}`

const priceId = (plan) => `price_MonoErp${capitalize(plan.code)}Monthly`

seedFromConfig(store, '', {
  products: billing.plans.map((plan) => ({ id: productId(plan), name: `${plan.name} plan` })),
  prices: billing.plans.map((plan) => ({
    id: priceId(plan),
    product_name: `${plan.name} plan`,
    currency: 'usd',
    unit_amount: plan.monthlyPrice,
  })),
})

// emulate stamps every object with the time it was inserted and lists newest-inserted first, so
// everything goes in oldest first and gets its real date written back.
const catalogDate = new Date(billing.catalogCreatedAt).toISOString()

for (const product of stripe.products.all()) {
  stripe.products.update(product.id, { created_at: catalogDate })
}

// Plans bill monthly. emulate's prices are all one-time unless told otherwise.
for (const price of stripe.prices.all()) {
  stripe.prices.update(price.id, { created_at: catalogDate, type: 'recurring' })
}

for (const customer of billing.customers.toSorted((a, b) =>
  a.startedAt.localeCompare(b.startedAt),
)) {
  const record = stripe.customers.insert({
    stripe_id: customer.id,
    email: customer.email,
    name: customer.name,
    description: null,
    metadata: { portal_account_id: customer.portalAccountId },
  })

  stripe.customers.update(record.id, {
    created_at: new Date(`${customer.startedAt}T12:00:00Z`).toISOString(),
  })
}

for (const payment of billingHistory().toSorted((a, b) => a.date - b.date)) {
  const created_at = payment.date.toISOString()

  const intent = stripe.paymentIntents.insert({
    stripe_id: `pi_${payment.key}`,
    amount: payment.amount,
    currency: 'usd',
    status: payment.failed ? 'requires_payment_method' : 'succeeded',
    customer_id: payment.customer,
    description: payment.description,
    payment_method: null,
    metadata: {},
  })

  const charge = stripe.charges.insert({
    stripe_id: `ch_${payment.key}`,
    amount: payment.amount,
    currency: 'usd',
    status: payment.failed ? 'failed' : 'succeeded',
    customer_id: payment.customer,
    payment_intent_id: intent.stripe_id,
    description: payment.description,
    metadata: {},
  })

  stripe.paymentIntents.update(intent.id, { created_at })
  stripe.charges.update(charge.id, { created_at })
}

serve({ fetch: app.fetch, port })

console.log(`Stripe emulator on :${port} with ${billing.customers.length} customers`)

// One charge per month from the subscription's start until it was canceled or "now". Trials
// haven't been charged yet, and a past-due subscription's latest charge failed.
function billingHistory() {
  const now = new Date(billing.now)
  const plans = new Map(billing.plans.map((plan) => [plan.code, plan]))
  const payments = []

  for (const customer of billing.customers) {
    if (customer.status === 'trialing') continue

    const plan = plans.get(customer.plan)
    const end = customer.canceledAt ? new Date(`${customer.canceledAt}T12:00:00Z`) : now
    const start = new Date(`${customer.startedAt}T12:00:00Z`)
    const dates = []

    for (let month = 0; ; month++) {
      const date = new Date(start)
      date.setUTCMonth(start.getUTCMonth() + month)

      if (date > end) break
      dates.push(date)
    }

    for (const [index, date] of dates.entries()) {
      const period = date.toLocaleString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })

      payments.push({
        key: `${customer.id.slice('cus_'.length)}${date.toISOString().slice(0, 7).replace('-', '')}`,
        customer: customer.id,
        date,
        amount: plan.monthlyPrice,
        description: `${plan.name} plan, ${period}`,
        failed: customer.status === 'past_due' && index === dates.length - 1,
      })
    }
  }

  return payments
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1)
}
