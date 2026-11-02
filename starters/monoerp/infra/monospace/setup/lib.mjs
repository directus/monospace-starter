// Shared bits for the setup scripts: env loading, an authenticated fetch against the
// Monospace API, and workspace schema reads keyed by dbName (ids differ per install).

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import appConfig from '../../../app.config.json' with { type: 'json' }
import { connectors } from './installed.mjs'

try {
  loadEnvFile(new URL('../../../.env', import.meta.url))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const baseUrl =
  process.env.MONOSPACE_URL ?? `http://127.0.0.1:${process.env.MONOSPACE_PORT ?? '8100'}`

export const apiUrl = `${baseUrl.replace(/\/$/, '')}/api`

export const { workspace, appSource } = appConfig

export const workspacePath = `/${encodeURIComponent(workspace)}`

// Exclude bookkeeping schemas from the shared API (applied migrations live in ops).
export const excludedNamespaces = { [appSource]: ['ops'] }

// Drops introspection operations that would import an excluded schema or anything in it.
// `namespaceIds` maps already-imported namespace ids to their dbName.
export function withoutExcluded(operations, excluded, namespaceIds = new Map()) {
  const skipped = new Set(
    [...namespaceIds].flatMap(([id, dbName]) => (excluded.includes(dbName) ? [id] : [])),
  )

  for (const operation of operations) {
    if (operation.kind === 'createNamespace' && excluded.includes(operation.data.dbName)) {
      skipped.add(operation.data.id)
    }
  }

  return operations.filter(
    (operation) => !skipped.has(operation.data.id) && !skipped.has(operation.data.namespaceId),
  )
}

let cookie = ''

// JSON with keys sorted at every depth. The engine stores JSON with its own key order, so this
// is what makes stored and wanted values comparable and a re-export stable. An array replacer
// both picks and orders the keys JSON.stringify writes, so first collect every key in use.
export function canonicalJson(value) {
  const keys = new Set()

  JSON.stringify(value, (key, child) => {
    keys.add(key)

    return child
  })

  return JSON.stringify(
    value ?? null,
    [...keys].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  )
}

export async function request(path, init = {}, retries = 0) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body) headers.set('content-type', 'application/json')

  if (cookie) headers.set('cookie', cookie)

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(60_000),
  })

  const setCookies = response.headers.getSetCookie()

  if (setCookies.length > 0) {
    cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ')
  }

  const body = await response.text()

  // With several Monospace replicas, one that missed the cluster message about a new workspace
  // (for example, still connecting to RabbitMQ on a first deploy) answers 404 until it catches up.
  if (response.status === 404 && /Workspace `[^`]+` not found/.test(body) && retries < 12) {
    await new Promise((resolve) => setTimeout(resolve, 5_000))

    return request(path, init, retries + 1)
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(`${init.method ?? 'GET'} ${path} returned ${response.status}: ${body}`),
      { status: response.status, body },
    )
  }

  return body ? JSON.parse(body) : null
}

// Only keyless installs may skip a licensed feature. A configured key should satisfy the
// deployment's entitlements; a refusal there is a setup failure worth surfacing.
export async function runSetupStep(title, action) {
  try {
    await action()

    return true
  } catch (error) {
    if (
      error.status !== 402 ||
      process.env.MONOSPACE_LICENSE__KEY?.trim() ||
      process.env.NODE_ENV === 'production'
    )
      throw error
    const violations = JSON.parse(error.body).meta?.violations ?? []
    const seats = violations.find((violation) => violation.entitlement === 'seats')
    const policies = violations.some((violation) => violation.entitlement === 'custom_policies')

    const reason = seats
      ? `the free tier allows ${seats.hard_limit} users`
      : policies
        ? 'the free tier does not include custom policies'
        : 'the free tier does not include this feature'

    console.log(`Skipped ${title}: ${reason}. Add a license key to enable it.`)

    return false
  }
}

export async function authenticate() {
  const { data: providers } = await request('/auth/providers')

  const provider = providers.find(
    (candidate) => candidate.protocol === 'password' && candidate.loginMethod === 'POST',
  )

  if (!provider) throw new Error('No password authentication provider is available')

  await request(`/auth/providers/${provider.apiName}${provider.loginPath}`, {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.MONOSPACE_ADMIN_EMAIL ?? 'admin@example.com',
      password: process.env.MONOSPACE_ADMIN_PASSWORD ?? 'monospace',
    }),
  })
}

// Monospace's own tables aren't served through /items. Sources have a list endpoint; the
// collections and fields only come in the schema manifest Studio reads (GET /{workspace}/schema).
export async function readSources() {
  const { data } = await request(
    `${workspacePath}/schema/structure/sources?fields=id,apiName,provider&limit=50`,
  )

  return data
}

// Every collection with its primitive and relation fields, plus `source` (apiName) so
// callers can address a collection as `${source}.${dbName}`. The manifest interns names in
// `strings` and points at other entries by position.
export async function readCollections() {
  const manifest = await request(`${workspacePath}/schema`)
  const text = (ref) => manifest.strings[ref]
  const { sources, collections } = manifest.monospaceSchema

  return collections.map((collection) => ({
    id: collection.id,
    apiName: text(collection.apiName),
    dbName: text(collection.dbName ?? collection.apiName),
    sourceId: sources[collection.source].id,
    source: text(sources[collection.source].name),
    isSystem: collection.isSystem ?? false,
    primitiveFields: collection.primitiveFields.map((field) => ({
      id: field.id,
      apiName: text(field.apiName),
      dbName: text(field.dbName ?? field.apiName),
      type: manifest.primitiveTypes[field.type],
      defaultValue: field.defaultValue ?? null,
      isNullable: field.isNullable ?? false,
      isList: field.isList ?? false,
    })),
    relationFields: collection.relationFields.map((field) => ({
      id: field.id,
      apiName: text(field.apiName),
      isList: field.isList ?? false,
      oppositeCollectionId: collections[field.oppositeCollection].id,
      oppositeFieldId: collections[field.oppositeCollection].relationFields[field.oppositeField].id,
      constraintId: field.constraint?.id ?? null,
    })),
  }))
}

// Where Monospace serves each kind of field and collection metadata (Studio's labels, icons, order).
export const metaPaths = {
  MonospaceCollectionMeta: `${workspacePath}/schema/meta/collections`,
  MonospacePrimitiveFieldMeta: `${workspacePath}/schema/meta/fields/primitive`,
  MonospaceSingleRelationFieldMeta: `${workspacePath}/schema/meta/fields/single-relation`,
}

export function findCollection(collections, source, dbName) {
  const match = collections.find((c) => c.source === source && c.dbName === dbName)

  if (!match)
    throw new Error(`Collection ${source}.${dbName} is missing; introspect the source first`)

  return match
}

export function findField(collection, dbName) {
  const match = collection.primitiveFields.find((field) => field.dbName === dbName)

  if (!match) throw new Error(`${collection.source}.${collection.dbName}.${dbName} is missing`)

  return match
}

export async function migrate(operations, summary) {
  if (operations.length === 0) {
    console.log(`${summary}: nothing to do`)

    return
  }

  await request(`${workspacePath}/schema/migrate`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  })
  console.log(`${summary}: applied ${operations.length} operation(s)`)
}

export function sourceName(id) {
  const connector = connectors.find((candidate) => candidate.id === id)

  if (!connector) throw new Error(`Connector is absent or disabled: ${id}`)

  return connector.source.apiName
}

export function ensureRelation(collections, { relationName, from, to, constrained = false }) {
  const first = findCollection(collections, from.source, from.collection)
  const second = findCollection(collections, to.source, to.collection)
  const existing = first.relationFields.find((field) => field.apiName === from.apiName)

  if (existing) {
    if (existing.oppositeCollectionId !== second.id)
      throw new Error(`${first.dbName}.${from.apiName} points at the wrong collection`)

    return []
  }

  return [
    {
      kind: 'createRelationFieldPair',
      data: {
        kind: 'single',
        data: {
          relationName,
          onDelete: 'noAction',
          onUpdate: 'noAction',
          firstField: {
            id: randomUUID(),
            apiName: from.apiName,
            isList: false,
            isConstrained: constrained,
            collectionId: first.id,
            fieldIds: [findField(first, from.field).id],
          },
          secondField: {
            id: randomUUID(),
            apiName: to.apiName,
            isList: to.isList ?? false,
            isConstrained: false,
            collectionId: second.id,
            fieldIds: [findField(second, to.field).id],
          },
        },
      },
    },
  ]
}

export const META_FIELDS = {
  collection: 'displayTemplate,displayName,description,icon,isHidden,color',
  field:
    'displayName,description,typeTemplateId,typeOptions,inputId,inputOptions,displayId,displayOptions,isHidden,sort',
}

const root = fileURLToPath(new URL('../../../', import.meta.url))

export function compose(args) {
  try {
    return execFileSync('docker', ['compose', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

// This folder's compose `monospace` service, or null when it was never created. Compose before
// 2.21 prints a JSON array instead of one object per line.
export function composeMonospace() {
  const line = compose(['ps', '--all', '--format', 'json', 'monospace']).split('\n')[0]
  let entry

  try {
    const parsed = JSON.parse(line)

    entry = Array.isArray(parsed) ? parsed[0] : parsed
  } catch {
    return null
  }

  if (!entry) return null

  const { State, Publishers = [] } = entry
  const published = Publishers.find((publisher) => publisher.TargetPort === 8100)

  return { state: State, publishedPort: String(published?.PublishedPort ?? '') }
}

// Monospace answers JSON, even while it starts; anything else on the port is another app.
export function answerKind(response) {
  if (!response) return 'none'

  return response.headers.get('content-type')?.startsWith('application/json')
    ? 'monospace'
    : 'other'
}

const portHelp = (port) =>
  [
    `See what's using it: docker ps --filter publish=${port}, or ${
      process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -i :${port}`
    }`,
    'Fix: stop that, or change MONOSPACE_PORT (and the other *_PORT values) in .env.',
    'To use a Monospace you run yourself, set MONOSPACE_URL in .env.',
  ].join('\n')

// Why setup can't talk to this folder's compose Monospace, or '' when it can. `container` is the
// compose `monospace` service ({ state, publishedPort }) or null, `answer` what replies on `port`
// ('none', 'monospace', or 'other'), `logs` the container's latest log lines. Docker Desktop
// publishes the port even when a host app already listens on it, so compose alone can't tell.
export function monospaceProblem({ port, container, answer, logs = '' }) {
  if (container?.state === 'restarting') {
    const lines = logs.trim().split('\n')
    const errors = lines.filter((line) => /error|fail|fatal/i.test(line))
    const tail = (errors.length > 0 ? errors : lines).slice(-5).join('\n')

    const license = /License entitlement check failed/.test(logs)
      ? [
          '',
          'Monospace refused to start without a license. This Docker project already has data',
          'from a licensed setup or another copy of this starter (same folder name, same data).',
          'Fix: set COMPOSE_PROJECT_NAME in .env to start clean, or add a license key.',
        ]
      : []

    return [`This project's Monospace keeps restarting. Last log lines:`, tail, ...license].join(
      '\n',
    )
  }

  const ours = container?.state === 'running' && container.publishedPort === port

  if (ours && answer !== 'other') return ''

  if (answer !== 'none' || container?.state === 'running')
    return [`Port ${port} isn't this project's Monospace.`, portHelp(port)].join('\n')

  // No container at all: compose never got as far as ports, so don't point at one.
  if (!container)
    return [
      `This project's Monospace isn't running. Start it with: docker compose up -d`,
      "If that fails, its error says why. 'all predefined address pools have been fully subnetted'",
      'means Docker is out of networks: docker network prune frees the unused ones.',
    ].join('\n')

  return [
    `This project's Monospace isn't running. Start it with: docker compose up -d`,
    `If that fails on port ${port}, something else has it.`,
    portHelp(port),
  ].join('\n')
}
