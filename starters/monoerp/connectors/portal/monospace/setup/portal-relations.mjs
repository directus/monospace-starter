// Draws the cross-source relations that join the CRM
// to the customer portal:
//   organizations.portal_account_id -> accounts.id   (organizations.portalAccount)
//   contacts.email                  -> users.email   (contacts.portalUser)
// Idempotent: skips anything already in place, and anything on a source that isn't connected.
import {
  authenticate,
  appSource,
  sourceName,
  ensureRelation,
  migrate,
  readCollections,
} from '#setup'

const PORTAL = sourceName('portal')

const crossSourceRelations = [
  {
    relationName: 'organizations_portal_account',
    from: {
      source: appSource,
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
    from: { source: appSource, collection: 'contacts', field: 'email', apiName: 'portalUser' },
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

  operations.push(...ensureRelation(collections, relation))
}

await migrate(operations, 'Portal relations')
