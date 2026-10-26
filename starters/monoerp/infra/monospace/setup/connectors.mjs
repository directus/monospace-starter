import './lib.mjs'
import {
  readPieces,
  repository,
  requestedConnectors,
  resolveSource,
  selectConnectors,
} from '../../pieces.mjs'
import { modules, moduleSteps } from './modules.mjs'

const requested = requestedConnectors(modules, process.env.OPTIONAL_SOURCES)

export const connectors = selectConnectors(readPieces(), process.env.OPTIONAL_SOURCES).map(
  (piece) => ({
    ...piece,
    source: resolveSource(piece.source),
    directory: new URL(`connectors/${piece.id}/`, repository),
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

export function availableSetupSteps(phase) {
  const connectorSteps = connectors.flatMap((connector) =>
    connector.setup[phase].map(({ title, script, requires = [] }) => ({
      owner: connector.id,
      script,
      title,
      requires,
      url: new URL(`monospace/setup/${script}`, connector.directory),
    })),
  )

  return [...connectorSteps, ...moduleSteps(phase)].filter((step) => {
    const missing = step.requires.filter((id) => !connectorAvailable(id))

    if (missing.length) console.log(`${step.title}: skipped, requires ${missing.join(', ')}`)

    return !missing.length
  })
}
