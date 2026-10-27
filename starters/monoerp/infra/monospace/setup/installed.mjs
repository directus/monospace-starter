import { loadEnvFile } from 'node:process'
import { readFile } from 'node:fs/promises'
import {
  readManifests,
  repository,
  requestedConnectors,
  resolveSource,
  selectConnectors,
} from '../../manifests.mjs'

try {
  loadEnvFile(new URL('../../../.env', import.meta.url))
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

export const modules = readManifests().flatMap((manifest) =>
  manifest.kind === 'module'
    ? [{ ...manifest, directory: new URL(`${manifest.infra}/`, repository) }]
    : [],
)

const requested = requestedConnectors(modules, process.env.OPTIONAL_SOURCES)

export const connectors = selectConnectors(readManifests(), process.env.OPTIONAL_SOURCES).map(
  (connector) => ({
    ...connector,
    source: resolveSource(connector.source),
    directory: new URL(`connectors/${connector.id}/`, repository),
  }),
)

export const unavailableConnectors = [
  ...new Set([
    ...requested,
    ...modules.flatMap((module) => [...module.requires, ...module.optional]),
  ]),
].filter((id) => !connectors.some((connector) => connector.id === id))

export function connectorAvailable(id) {
  return connectors.some((connector) => connector.id === id)
}

export function logMissingConnectors() {
  for (const id of unavailableConnectors) {
    console.log(
      `${id}: skipped, ${requested.has(id) ? 'connector folder is absent' : 'disabled in OPTIONAL_SOURCES'}`,
    )
  }
}

export function setupSteps(phase) {
  return [...connectors, ...modules].flatMap((owner) =>
    owner.setup[phase].flatMap(({ title, script, requires = [] }) => {
      const missing = requires.filter((id) => !connectorAvailable(id))

      if (missing.length) {
        console.log(`${title}: skipped, requires ${missing.join(', ')}`)

        return []
      }

      return [{ owner: owner.id, script, title, requires }]
    }),
  )
}

export async function readSchemas() {
  const schemas = []

  for (const manifest of [...modules, ...connectors]) {
    for (const path of manifest.schemaFiles) {
      const url = new URL(path, repository)
      const schema = JSON.parse(await readFile(url, 'utf8'))
      schemas.push({ file: `${manifest.id}/${path.split('/').at(-1)}`, url, schema })
    }
  }

  return schemas
}
