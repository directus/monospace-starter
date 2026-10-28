import {
  authenticate,
  sourceName,
  ensureRelation,
  migrate,
  readCollections,
} from '../../../../infra/monospace/setup/lib.mjs'

await authenticate()

const collections = await readCollections()

// Extension sources cannot be edited, so Portal holds the constraint.
const operations = ensureRelation(collections, {
  relationName: 'accounts_stripe_customer',
  constrained: true,
  from: {
    source: sourceName('portal'),
    collection: 'accounts',
    field: 'stripe_customer_id',
    apiName: 'stripeCustomer',
  },
  to: {
    source: sourceName('stripe'),
    collection: 'customers',
    field: 'id',
    apiName: 'portalAccount',
  },
})

await migrate(operations, 'Portal to Stripe relation')
