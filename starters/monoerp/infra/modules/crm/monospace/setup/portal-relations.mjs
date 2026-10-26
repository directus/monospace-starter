// Draws the cross-source relations that join the CRM
// to the customer portal:
//   organizations.portal_account_id -> accounts.id   (organizations.portalAccount)
//   contacts.email                  -> users.email   (contacts.portalUser)
// Idempotent: skips anything already in place, and anything on a source that isn't connected.
import { randomUUID } from 'node:crypto'
import {
  authenticate,
  findCollection,
  findField,
  migrate,
  readCollections,
} from '../../../../monospace/setup/lib.mjs'

const CRM = process.env.MONOSPACE_CRM_SOURCE ?? 'CRM'

const PORTAL = process.env.MONOSPACE_PORTAL_SOURCE ?? 'Portal'

const crossSourceRelations = [
  {
    relationName: 'organizations_portal_account',
    from: {
      source: CRM,
      collection: 'organizations',
      field: 'portal_account_id',
      apiName: 'portalAccount',
    },
    to: {
      source: PORTAL,
      collection: 'accounts',
      field: 'id',
      apiName: 'organization',
      isList: false,
    },
  },
  {
    relationName: 'contacts_portal_user',
    from: { source: CRM, collection: 'contacts', field: 'email', apiName: 'portalUser' },
    to: { source: PORTAL, collection: 'users', field: 'email', apiName: 'contacts', isList: true },
  },
]

await authenticate()

const collections = await readCollections()

const connected = new Set(collections.map((collection) => collection.source))

const operations = []

for (const relation of crossSourceRelations) {
  if (!connected.has(relation.from.source) || !connected.has(relation.to.source)) {
    console.log(`${relation.relationName}: skipped, a source isn't connected`)
    continue
  }

  const from = findCollection(collections, relation.from.source, relation.from.collection)
  const to = findCollection(collections, relation.to.source, relation.to.collection)
  const existing = from.relationFields.find((field) => field.apiName === relation.from.apiName)

  if (existing) {
    if (existing.oppositeCollectionId !== to.id) {
      throw new Error(`${from.dbName}.${relation.from.apiName} points at the wrong collection`)
    }

    continue
  }

  operations.push({
    kind: 'createRelationFieldPair',
    data: {
      kind: 'single',
      data: {
        relationName: relation.relationName,
        onDelete: 'noAction',
        onUpdate: 'noAction',
        firstField: {
          id: randomUUID(),
          apiName: relation.from.apiName,
          isList: false,
          isConstrained: false,
          collectionId: from.id,
          fieldIds: [findField(from, relation.from.field).id],
        },
        secondField: {
          id: randomUUID(),
          apiName: relation.to.apiName,
          isList: relation.to.isList,
          isConstrained: false,
          collectionId: to.id,
          fieldIds: [findField(to, relation.to.field).id],
        },
      },
    },
  })
}

await migrate(operations, 'Portal relations')
