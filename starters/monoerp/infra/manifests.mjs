import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { manifestSchemas, schemaUrl } from '../tools/manifest-schema.mjs'

export const repository = new URL('../', import.meta.url)

export const partKinds = [
  ['modules', 'module'],
  ['connectors', 'connector'],
  ['deploy', 'deploy'],
]

// Every folder under modules/, connectors/ and deploy/ is a part; its name is the id.
export function partFolders(root = repository) {
  return partKinds.flatMap(([base, kind]) => {
    const directory = new URL(`${base}/`, root)

    if (!existsSync(directory)) return []

    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))
      .map((id) => ({ kind, id, folder: `${base}/${id}`, file: `${base}/${id}/${kind}.json` }))
  })
}

function files(root, directory, pattern) {
  const url = new URL(`${directory}/`, root)

  if (!existsSync(url)) return []

  return readdirSync(url)
    .filter((name) => pattern.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${directory}/${name}`)
}

function compose(root, folder) {
  return {
    compose: existsSync(new URL(`${folder}/compose.yml`, root))
      ? `${folder}/compose.yml`
      : undefined,
    composeProfiles: Object.fromEntries(
      files(root, folder, /^compose\.[a-z][a-z0-9-]*\.yml$/).map((path) => [
        path.split('/').at(-1).split('.')[1],
        path,
      ]),
    ),
  }
}

// Everything findable on disk is derived here, so manifests only declare what cannot be found.
function conventions(root, kind, folder, runtime) {
  const exists = (path) => existsSync(new URL(`${folder}/${path}`, root))

  if (kind === 'module') {
    return {
      app: folder,
      infra: `${folder}/infra`,
      setupDirectory: `${folder}/infra/monospace/setup`,
      schemaFiles: files(root, `${folder}/infra/monospace/schema`, /\.json$/),
      ...compose(root, folder),
    }
  }

  if (kind === 'connector') {
    const extension = `${folder}/extension/extension.config.json`

    return {
      setupDirectory: `${folder}/monospace/setup`,
      schemaFiles: files(root, `${folder}/monospace/schema`, /\.json$/),
      ...compose(root, folder),
      extension: existsSync(new URL(extension, root))
        ? {
            directory: 'extension',
            installed: JSON.parse(readFileSync(new URL(extension, root), 'utf8')).id.replaceAll(
              '/',
              '__',
            ),
          }
        : undefined,
      migrate: exists('emulator/migrate.sh') ? 'emulator/migrate.sh' : undefined,
      provision: exists('emulator/provision.sh') ? 'emulator/provision.sh' : undefined,
      frontend: Object.entries(runtime.contributes)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([module, feature]) => ({ module, path: `${folder}/frontend/${module}`, ...feature })),
    }
  }

  if (kind === 'deploy')
    return { lint: exists('lint/config.ts') ? `${folder}/lint/config.ts` : undefined }

  return {}
}

export function readManifest(root, { kind, id, folder, file }) {
  const document = JSON.parse(readFileSync(new URL(file, root), 'utf8'))

  if (document.$schema !== schemaUrl(kind))
    throw new Error(`${file}: $schema must be ${schemaUrl(kind)}`)

  const result = manifestSchemas[kind].safeParse(document)

  if (!result.success)
    throw new Error(
      `${file}: ${result.error.issues
        .map((issue) => `${[...issue.path].join('.') || 'manifest'} ${issue.message}`)
        .join('; ')}`,
    )

  const { $schema: _schema, 'x-monoerp': runtime = {}, ...envelope } = result.data

  return {
    requires: [],
    alsoOwns: [],
    packageEntries: [],
    ...envelope,
    ...runtime,
    kind,
    id,
    folder,
    file,
    ownedPaths: kind === 'starter' ? [] : [folder, ...(envelope.alsoOwns ?? [])],
    ...conventions(root, kind, folder, runtime),
  }
}

export function readManifests(root = repository) {
  const parts = partFolders(root).filter((part) => {
    if (existsSync(new URL(part.file, root))) return true
    console.warn(`${part.folder}: ignored, no ${part.kind}.json (remove the leftover folder)`)

    return false
  })

  return [
    ...(existsSync(new URL('starter.json', root))
      ? [{ kind: 'starter', id: 'starter', folder: '', file: 'starter.json' }]
      : []),
    ...parts,
  ].map((part) => readManifest(root, part))
}

// Installed connectors are selected unless OPTIONAL_SOURCES names a different list.
export function requestedConnectors(manifests, override) {
  return new Set(
    override === undefined
      ? manifests.flatMap((manifest) =>
          manifest.kind === 'connector'
            ? [manifest.id]
            : manifest.kind === 'module'
              ? manifest.requires
              : [],
        )
      : override
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
  )
}

// Source JSON uses env/default leaves and when/value/otherwise branches; no app code is loaded.
export function resolveSource(value, env = process.env) {
  if (Object(value) !== value) return value

  if (Object.hasOwn(value, 'env')) {
    const configured = env[value.env]

    const resolved =
      (value.emptyUsesDefault && !configured ? undefined : configured) ?? value.default

    return Number.isFinite(value.default) ? Number(resolved) : resolved
  }

  if (Object.hasOwn(value, 'when')) {
    return resolveSource(env[value.when] ? value.value : value.otherwise, env)
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const resolved = resolveSource(child, env)

      return resolved === undefined ? [] : [[key, resolved]]
    }),
  )
}

export function selectConnectors(manifests, override) {
  const requested = requestedConnectors(manifests, override)

  return manifests.filter((manifest) => manifest.kind === 'connector' && requested.has(manifest.id))
}

export function selectSetupStep(selector, manifests, selected) {
  if (!/^[a-z][a-z0-9-]*\/[a-zA-Z0-9_/-]+\.mjs$/.test(selector) || selector.includes('..')) {
    throw new Error('Setup steps must be owner-qualified, for example crm/backfill-owners.mjs')
  }

  const separator = selector.indexOf('/')
  const owner = manifests.find((manifest) => manifest.id === selector.slice(0, separator))

  if (!owner) return undefined
  const script = selector.slice(separator + 1)

  const step = [...(owner.setup?.beforeSchema ?? []), ...(owner.setup?.afterSchema ?? [])].find(
    (step) => step.script === script,
  )

  if (!step) throw new Error(`Unknown setup step: ${selector}`)

  if (
    (owner.kind === 'connector' && !selected.includes(owner.id)) ||
    !(step.requires ?? []).every(
      (id) =>
        selected.includes(id) ||
        manifests.some((manifest) => manifest.kind === 'module' && manifest.id === id),
    )
  )
    return undefined

  return { ...step, owner }
}
