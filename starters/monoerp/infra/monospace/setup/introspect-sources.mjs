import { connectors } from './installed.mjs'
import { readSources } from './lib.mjs'
import { appSource } from './lib.mjs'
// Re-introspects every non-system data source in the workspace. Run this after a SQL
// migration, then regenerate the SDK. Introspection applies what it finds to Monospace's
// model and never writes to the source.
//
// Excluded schemas (see lib.mjs) are filtered from the diff and stored on the source, so a
// source created before the exclusion existed stops importing them too.
import {
  authenticate,
  excludedNamespaces,
  request,
  withoutExcluded,
  workspacePath,
} from './lib.mjs'

const selected = new Set([appSource, ...connectors.map((connector) => connector.source.apiName)])

await authenticate()

const sources = await readSources()

const { data: namespaces } = await request(
  `${workspacePath}/schema/structure/namespaces?fields=id,dbName&limit=500`,
)

const namespaceIds = new Map(namespaces.map((namespace) => [namespace.id, namespace.dbName]))

for (const source of sources.filter((candidate) => candidate.apiName !== '_system')) {
  if (!selected.has(source.apiName)) {
    console.log(`${source.apiName}: skipped, source manifest is absent or disabled`)
    continue
  }

  const path = `${workspacePath}/schema/introspect/${source.id}`
  const excluded = excludedNamespaces[source.apiName] ?? []
  const { data: diff } = await request(`${path}/diff`, { method: 'POST' })
  const operations = withoutExcluded(diff.operations, excluded, namespaceIds)

  // The diff ignores stored exclusions, so anything filtered out means an excluded schema
  // exists. Store the exclusion anyway, so a re-scan from Studio also skips it.
  if (operations.length === diff.operations.length && !operations.length) {
    console.log(`${source.apiName}: no schema changes`)
    continue
  }

  const present = new Set([
    ...namespaceIds.values(),
    ...diff.operations
      .filter((operation) => operation.kind === 'createNamespace')
      .map((operation) => operation.data.dbName),
  ])

  await request(path, {
    method: 'POST',
    body: JSON.stringify({
      migration: { operations },
      introspection: {
        excludedNamespaces: excluded
          .filter((dbName) => present.has(dbName))
          .map((dbName) => ({ dbName })),
        excludedCollections: [],
      },
    }),
  })
  console.log(
    operations.length
      ? `${source.apiName}: applied ${operations.length} operation(s)`
      : `${source.apiName}: no schema changes`,
  )
}
