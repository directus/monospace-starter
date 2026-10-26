import { randomUUID } from 'node:crypto'
import {
  authenticate,
  findCollection,
  findField,
  migrate,
  readCollections,
} from '../../../../infra/monospace/setup/lib.mjs'

const PORTAL = process.env.MONOSPACE_PORTAL_SOURCE ?? 'Portal'

const STRIPE = process.env.MONOSPACE_STRIPE_SOURCE ?? 'Stripe'

await authenticate()

const collections = await readCollections()

const from = findCollection(collections, PORTAL, 'accounts')

const to = findCollection(collections, STRIPE, 'customers')

const existing = from.relationFields.find((field) => field.apiName === 'stripeCustomer')

if (existing && existing.oppositeCollectionId !== to.id) {
  throw new Error(`${from.dbName}.stripeCustomer points at the wrong collection`)
}

const operations = existing
  ? []
  : [
      {
        kind: 'createRelationFieldPair',
        data: {
          kind: 'single',
          data: {
            relationName: 'accounts_stripe_customer',
            onDelete: 'noAction',
            onUpdate: 'noAction',
            firstField: {
              id: randomUUID(),
              apiName: 'stripeCustomer',
              isList: false,
              // Extension sources cannot be edited, so Portal must hold the constraint.
              isConstrained: true,
              collectionId: from.id,
              fieldIds: [findField(from, 'stripe_customer_id').id],
            },
            secondField: {
              id: randomUUID(),
              apiName: 'portalAccount',
              isList: false,
              isConstrained: false,
              collectionId: to.id,
              fieldIds: [findField(to, 'id').id],
            },
          },
        },
      },
    ]

await migrate(operations, 'Portal to Stripe relation')
