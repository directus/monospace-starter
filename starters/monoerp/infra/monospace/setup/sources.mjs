// Makes sure the workspace and its data sources exist: the shared database and selected external
// sources unless OPTIONAL_SOURCES leaves them out. Hosts default to the compose service names,
// which is what Monospace sees from inside the stack.
// Creating a source introspects it, so on a fresh install the collections appear here.
import { connectors, logMissingConnectors } from './installed.mjs'
import {
  appSource,
  authenticate,
  excludedNamespaces,
  readSources,
  request,
  workspace,
  workspacePath,
} from './lib.mjs'

logMissingConnectors()

// Managed databases require TLS; local compose databases don't offer it.
const ssl = process.env.DB_SSL_MODE ? { ssl: { mode: process.env.DB_SSL_MODE } } : {}

const sources = [
  {
    apiName: appSource,
    provider: 'postgres',
    host: process.env.APP_DB_HOST ?? 'app-postgres',
    port: Number(process.env.APP_DB_INTERNAL_PORT ?? 5432),
    user: process.env.APP_DB_USER ?? 'app',
    password: process.env.APP_DB_PASSWORD ?? 'monospace',
    dbname: process.env.APP_DB_NAME ?? 'app',
    ...ssl,
  },
  ...connectors.map((connector) => connector.source),
]

await authenticate()

const { data: workspaces } = await request('/system/workspaces?fields=id,apiName')

if (!workspaces.some((candidate) => candidate.apiName === workspace)) {
  await request('/system/workspaces', {
    method: 'POST',
    body: JSON.stringify({ apiName: workspace, displayName: workspace.toUpperCase() }),
  })
  console.log(`Created workspace ${workspace}`)
}

const existing = await readSources()

for (const source of sources) {
  const connected = existing.find((candidate) => candidate.apiName === source.apiName)

  if (connected) {
    // Sources connected before their manifest declared `access` pick it up here.
    if (source.access)
      await request(`${workspacePath}/sources/data/${connected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ access: source.access }),
      })
    console.log(`${source.apiName}: already connected`)
    continue
  }

  if (source.config) {
    await connectExtension(source)
    console.log(
      `${source.apiName}: connected ${source.provider} at ${source.config.apiBase ?? source.config.environment}`,
    )
    continue
  }

  await request(`${workspacePath}/sources/data`, {
    method: 'POST',
    body: JSON.stringify({ ...source, introspection: await introspection(source) }),
  })
  console.log(`${source.apiName}: connected ${source.provider} at ${source.host}`)
}

// An extension's data source only reaches the hosts it's granted. Monospace answers the first
// request with the ones the connector needs; this repo's own connector gets them approved.
async function connectExtension(source) {
  // Monospace loads a new connector build a moment after it lands in its extensions folder.
  for (let attempt = 0; !(await connectorLoaded(source.provider)); attempt++) {
    if (attempt === 15)
      throw new Error(
        `Monospace hasn't loaded ${source.provider}. After a connector's first build, run \`docker compose restart monospace\`; otherwise check its logs`,
      )
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  const create = (permissions) =>
    request(`${workspacePath}/sources/data`, {
      method: 'POST',
      body: JSON.stringify({ ...source, permissions }),
    })

  try {
    await create([])
  } catch (error) {
    const required = error.status === 422 ? JSON.parse(error.body).meta?.permissions : undefined

    if (!required) throw error
    console.log(
      `${source.apiName}: approving ${required.map((grant) => grant.permission).join(', ')}`,
    )
    await create(required)
  }
}

// Exclusions have to be set when the source is created, or its first introspection imports
// them. Monospace wants the preview's hash with them and rejects schemas that don't exist.
async function introspection(source) {
  const excluded = excludedNamespaces[source.apiName] ?? []

  if (!excluded.length) return undefined
  const { apiName: _, access: __, ...config } = source

  const { data: preview } = await request(`${workspacePath}/sources/data/introspect`, {
    method: 'POST',
    body: JSON.stringify(config),
  })

  const present = new Set(preview.schema.namespaces.map((namespace) => namespace.name))

  return {
    hash: preview.hash,
    excludedNamespaces: excluded
      .filter((dbName) => present.has(dbName))
      .map((dbName) => ({ dbName })),
  }
}

async function connectorLoaded(provider) {
  const { data } = await request(`${workspacePath}/connectors/data`)

  return data.some((connector) => connector.id === provider)
}
