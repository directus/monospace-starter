import { readFile } from 'node:fs/promises'
import { loadEnvFile } from 'node:process'

import appConfig from '../../../app.config.json' with { type: 'json' }
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

const manifests = readManifests()

export const modules = manifests.flatMap((manifest) =>
  manifest.kind === 'module'
    ? [{ ...manifest, directory: new URL(`${manifest.infra}/`, repository) }]
    : [],
)

const requested = requestedConnectors(manifests, process.env.OPTIONAL_SOURCES)

export const connectors = selectConnectors(manifests, process.env.OPTIONAL_SOURCES).map(
  (connector) => ({
    ...connector,
    source: resolveSource(connector.source),
    directory: new URL(`${connector.folder}/`, repository),
  }),
)

export const unavailableConnectors = [
  ...new Set([
    ...requested,
    ...manifests.flatMap((manifest) => (manifest.kind === 'connector' ? [manifest.id] : [])),
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
      const missing = requires.filter(
        (id) => !connectorAvailable(id) && !modules.some((module) => module.id === id),
      )

      if (missing.length) {
        console.log(`${title}: skipped, requires ${missing.join(', ')}`)

        return []
      }

      return [{ title, url: new URL(`${owner.setupDirectory}/${script}`, repository) }]
    }),
  )
}

export async function readSchemas() {
  const schemas = []

  for (const manifest of [...modules, ...connectors]) {
    for (const path of manifest.schemaFiles) {
      const url = new URL(path, repository)
      const definition = JSON.parse(await readFile(url, 'utf8'))

      const schema = {
        ...definition,
        source: manifest.kind === 'module' ? appConfig.appSource : manifest.source.apiName,
      }

      schemas.push({ file: `${manifest.id}/${path.split('/').at(-1)}`, url, schema })
    }
  }

  return schemas
}
