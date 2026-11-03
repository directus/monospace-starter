// Deletes a data source and the relations between it and other sources, so a removed connector
// leaves nothing behind in Monospace and Studio is never needed for it. Monospace won't delete a
// source while a relation points at it. Safe to rerun: a missing source is a no-op.
// Usage: pnpm setup:remove-source <apiName>
import { fileURLToPath } from 'node:url'

import {
  answerKind,
  apiUrl,
  authenticate,
  composeMonospace,
  migrate,
  monospaceProblem,
  readCollections,
  readSources,
  request,
  workspacePath,
} from './lib.mjs'

// One delete per relation pair with exactly one side in the source. A pair shows up on both of
// its collections, so it's keyed by its two field ids.
export function crossSourceRelations(collections, sourceId) {
  const inside = new Set(collections.flatMap((c) => (c.sourceId === sourceId ? [c.id] : [])))
  const pairs = new Map()

  for (const collection of collections) {
    for (const field of collection.relationFields) {
      if (inside.has(collection.id) === inside.has(field.oppositeCollectionId)) continue

      const key = [field.id, field.oppositeFieldId].sort((a, b) => a.localeCompare(b)).join()

      if (!pairs.has(key))
        pairs.set(key, {
          kind: 'deleteRelationFieldPair',
          data: { firstFieldId: field.id, secondFieldId: field.oppositeFieldId },
        })
    }
  }

  return [...pairs.values()]
}

// Only this folder's compose Monospace (or MONOSPACE_URL), so one copy never edits another's.
async function reachMonospace() {
  const response = await fetch(`${apiUrl}/system/ready`).catch(() => null)

  const problem = process.env.MONOSPACE_URL
    ? ''
    : monospaceProblem({
        port: new URL(apiUrl).port,
        container: composeMonospace(),
        answer: answerKind(response),
      })

  if (problem) throw new Error(problem)

  if (!response?.ok) throw new Error(`Monospace isn't ready at ${apiUrl}`)
}

export async function removeSource(apiName) {
  await reachMonospace()
  await authenticate()

  const source = (await readSources()).find((candidate) => candidate.apiName === apiName)

  if (!source) {
    console.log(`${apiName}: no such data source in Monospace, nothing to remove`)

    return
  }

  await migrate(
    crossSourceRelations(await readCollections(), source.id),
    `${apiName}: relations to other sources`,
  )
  await request(`${workspacePath}/sources/data/${source.id}`, { method: 'DELETE' })
  console.log(`${apiName}: removed the data source`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [apiName] = process.argv.slice(2)

  if (!apiName) {
    console.error('Usage: pnpm setup:remove-source <source apiName>, for example Stripe')
    process.exit(1)
  }

  try {
    await removeSource(apiName)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
