// Downloads the workspace OpenAPI document and trims it to the collections the app uses
// before `monospace generate` reads it. The full document (every system collection, plus
// the CRM and portal graphs joined across sources) generates types deep enough that tsc
// gives up with "Excessive stack depth"; the app's own slice checks fine.
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

import {
  fetchOpenApiDocument,
  isObject,
  refPath,
  repositoryDirectory,
  webDirectory,
} from './generate-zod-schemas.ts'
import type { JsonValue, OpenApiDocument } from './generate-zod-schemas.ts'

import { appCollections } from './module-collections.ts'

export const outputPath = resolve(webDirectory, 'monospace.openapi.json')

function componentRefs(node: JsonValue | undefined, out: Array<string> = []) {
  if (Array.isArray(node)) {
    for (const item of node) componentRefs(item, out)
  } else if (isObject(node)) {
    const ref = refPath.safeParse(node.$ref)

    if (ref.success && ref.data.startsWith('#/components/schemas/')) {
      out.push(ref.data.slice('#/components/schemas/'.length))
    }

    for (const value of Object.values(node)) componentRefs(value, out)
  }

  return out
}

// Component names are the owning collection's apiName followed by a suffix, so the longest
// matching collection name wins ("MonospacePageSection" over "MonospacePage").
function owningCollection(name: string, collections: Array<string>) {
  return collections
    .filter((collection) => name.startsWith(collection))
    .sort((left, right) => right.length - left.length)[0]
}

export function pruneDocument(document: OpenApiDocument, keep: ReadonlyArray<string>) {
  const mappings = document['x-monospace-mappings'] ?? {}
  const collections = Object.keys(mappings)
  const kept = new Set(keep)
  const missing = keep.filter((collection) => !Object.hasOwn(mappings, collection))

  if (missing.length) throw new Error(`Collections not in the workspace: ${missing.join(', ')}`)

  for (const collection of collections) {
    if (kept.has(collection)) continue
    delete mappings[collection]

    for (const path of Object.keys(document.paths ?? {})) {
      const [, , , , pathCollection] = path.split('/')

      if (pathCollection === collection) delete document.paths?.[path]
    }
  }

  const schemas = document.components?.schemas ?? {}

  for (const name of Object.keys(schemas)) {
    const owner = owningCollection(name, collections)

    if (owner && !kept.has(owner)) delete schemas[name]
  }

  // Anything left that points at a removed component goes too: relation properties on kept
  // collections, `include` parameters on their list routes. Repeat until nothing changes.
  const dangling = (node: JsonValue) => componentRefs(node).some((ref) => !schemas[ref])
  let changed = true

  while (changed) {
    changed = false

    const visit = (node: JsonValue | undefined) => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item)

        return
      }

      if (!isObject(node)) return

      if (isObject(node.properties)) {
        for (const [key, value] of Object.entries(node.properties)) {
          if (!dangling(value)) continue
          delete node.properties[key]

          if (Array.isArray(node.required)) {
            node.required = node.required.filter((item) => item !== key)
          }

          changed = true
        }
      }

      for (const combinator of ['allOf', 'anyOf', 'oneOf']) {
        const branches = node[combinator]

        if (!Array.isArray(branches)) continue
        const remaining = branches.filter((branch) => !dangling(branch))

        if (remaining.length !== branches.length) {
          node[combinator] = remaining
          changed = true
        }
      }

      if (Array.isArray(node.parameters)) {
        const remaining = node.parameters.filter((parameter) => !dangling(parameter))

        if (remaining.length !== node.parameters.length) {
          node.parameters = remaining
          changed = true
        }
      }

      for (const value of Object.values(node)) visit(value)
    }

    visit(document)
  }

  const unresolved = [...new Set(componentRefs(document).filter((ref) => !schemas[ref]))]

  if (unresolved.length) {
    throw new Error(`Pruned document still references: ${unresolved.join(', ')}`)
  }

  return document
}

async function main() {
  const envPath = resolve(repositoryDirectory, '.env')

  if (existsSync(envPath)) loadEnvFile(envPath)

  const document = pruneDocument(await fetchOpenApiDocument(), appCollections)
  await writeFile(outputPath, JSON.stringify(document), 'utf8')
  console.log(
    `Wrote ${outputPath} (${Object.keys(document.components?.schemas ?? {}).length} components)`,
  )
}

await main()
