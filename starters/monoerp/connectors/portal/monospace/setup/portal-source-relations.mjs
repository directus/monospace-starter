import { sourceName } from '#setup'
import { authenticate, findCollection, migrate, readCollections } from '#setup'

const PORTAL = sourceName('portal')

// Introspection names a single relation after the target collection ("accounts"). The
// app wants the singular.
const forwardRelationNames = {
  events: { accounts: 'account', users: 'user' },
  subscriptions: { accounts: 'account', plans: 'plan' },
  tickets: { accounts: 'account', users: 'user' },
  users: { accounts: 'account' },
}

await authenticate()

const collections = await readCollections()

const connected = new Set(collections.map((collection) => collection.source))

const operations = []

const portalRenames = connected.has(PORTAL) ? forwardRelationNames : {}

for (const [collectionDbName, renames] of Object.entries(portalRenames)) {
  const collection = findCollection(collections, PORTAL, collectionDbName)

  for (const [current, wanted] of Object.entries(renames)) {
    if (collection.relationFields.some((field) => field.apiName === wanted)) continue
    const field = collection.relationFields.find((candidate) => candidate.apiName === current)

    if (!field) throw new Error(`${PORTAL}.${collectionDbName}.${current} relation is missing`)
    operations.push({ kind: 'renameRelationField', data: { id: field.id, apiName: wanted } })
  }
}

await migrate(operations, 'Portal relation names')
