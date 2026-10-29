import { schemaUrl } from './manifest-schema.mjs'

const envelopeFields = new Set(['label', 'description', 'requires', 'alsoOwns', 'packageEntries'])

const bases = { module: 'modules', connector: 'connectors', deploy: 'deploy' }

// Fixture builders take flat settings and write the public document format.
export function manifestDocument({ kind, id, ...input }) {
  const fields = { label: id, description: 'Fixture', ...input }

  if (kind === 'starter')
    return { $schema: schemaUrl(kind), nextSteps: { create: [], remove: [] }, ...fields }

  const envelope = Object.fromEntries(
    Object.entries(fields).filter(([key]) => envelopeFields.has(key)),
  )

  const runtime = {
    ...(kind === 'module' ? { collections: [] } : kind === 'connector' ? { source: {} } : {}),
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => !envelopeFields.has(key))),
  }

  const document = { $schema: schemaUrl(kind), ...envelope }

  if (kind !== 'deploy') document['x-monoerp'] = runtime

  return document
}

export function manifestPath({ kind, id }) {
  return kind === 'starter' ? 'starter.json' : `${bases[kind]}/${id}/${kind}.json`
}
