// Pushes module and connector monospace/schema/*.json into the workspace: API names, engine-managed
// defaults, and Studio presentation meta (labels, icons, colors, select options, display
// templates, field order, hidden flags). Files are keyed by source apiName + collection
// dbName, relations by apiName, so the same file works on any install. Idempotent: renames
// and defaults go through one schema migration, meta rows are created or patched only when
// they differ. Run the relation scripts first; relations are matched by their apiName.
import {
  authenticate,
  canonicalJson,
  metaPaths,
  migrate,
  readCollections,
  request,
} from './lib.mjs'

import { modules, readSchemas } from './modules.mjs'
import { connectorAvailable } from './connectors.mjs'
import { schemaRelation } from './schema-relations.mjs'

const STRUCTURAL_KEYS = ['apiName', 'defaultValue']

// Fractional-index keys the way Studio writes them: "a0" < "a1" < … < "a9" < "aA" < … < "az".
const SORT_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

const sortKey = (index) => `a${SORT_DIGITS[index] ?? 'z'}`

const META_FIELDS = {
  collection: 'displayTemplate,displayName,description,icon,isHidden,color',
  field:
    'displayName,description,typeTemplateId,typeOptions,inputId,inputOptions,displayId,displayOptions,isHidden,sort',
}

// "{account.name} · {plan.name}" -> Studio's doc node with fieldId chains.
function renderTemplate(template, collection, resolve) {
  const content = []
  const pattern = /\{([^}]+)\}/g
  let last = 0

  for (const match of template.matchAll(pattern)) {
    if (match.index > last) content.push({ type: 'text', text: template.slice(last, match.index) })
    content.push({ type: 'ref', attrs: { fieldId: resolve(collection, match[1].split('.')) } })
    last = match.index + match[0].length
  }

  if (last < template.length) content.push({ type: 'text', text: template.slice(last) })

  return { type: 'doc', content }
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right)
}

await authenticate()

const collections = await readCollections()

const byId = new Map(collections.map((c) => [c.id, c]))

const connected = new Set(collections.map((collection) => collection.source))

const schemas = []

const pieceAvailable = (id) => connectorAvailable(id) || modules.some((module) => module.id === id)

for (const { file, schema } of await readSchemas()) {
  if (connected.has(schema.source)) {
    schemas.push({ file, schema })
  } else {
    console.log(`${file}: skipped, ${schema.source} isn't connected`)
  }
}

function findCollection(file, source, dbName) {
  const collection = collections.find((c) => c.source === source && c.dbName === dbName)

  if (!collection) throw new Error(`${file}: ${source}.${dbName} is not in the workspace`)

  return collection
}

// API names and defaults first, as one migration.
const operations = []

for (const { file, schema } of schemas) {
  for (const [dbName, definition] of Object.entries(schema.collections)) {
    const collection = findCollection(file, schema.source, dbName)

    if (definition.apiName && definition.apiName !== collection.apiName) {
      operations.push({
        kind: 'renameCollection',
        data: { id: collection.id, dbName: null, apiName: definition.apiName },
      })
    }

    const fieldUpdates = []

    for (const [fieldDbName, item] of Object.entries(definition.fields ?? {})) {
      const field = collection.primitiveFields.find((f) => f.dbName === fieldDbName)

      if (!field) throw new Error(`${file}: ${dbName}.${fieldDbName} is not a field`)

      if (item.apiName && item.apiName !== field.apiName) {
        operations.push({
          kind: 'renamePrimitiveField',
          data: { id: field.id, dbName: null, apiName: item.apiName },
        })
      }

      if (item.defaultValue && !sameJson(field.defaultValue, item.defaultValue)) {
        fieldUpdates.push({
          kind: 'updatePrimitiveField',
          data: {
            id: field.id,
            operations: [{ kind: 'changeDefaultValue', data: { defaultValue: item.defaultValue } }],
          },
        })
      }
    }

    if (fieldUpdates.length) {
      operations.push({
        kind: 'updateCollection',
        data: { id: collection.id, operations: fieldUpdates },
      })
    }
  }
}

await migrate(operations, 'API names and defaults')

// A path walks relation apiNames and ends on a primitive dbName.
function resolvePath(collection, path) {
  const ids = []
  let current = collection

  for (const [index, segment] of path.entries()) {
    const isLast = index === path.length - 1
    const primitive = isLast ? current.primitiveFields.find((f) => f.dbName === segment) : null

    if (primitive) {
      ids.push(primitive.id)
      break
    }

    const relation = current.relationFields.find((f) => f.apiName === segment)

    if (!relation)
      throw new Error(
        `${current.source}.${current.dbName}: unknown template path ${path.join('.')}`,
      )
    ids.push(relation.id)
    current = byId.get(relation.oppositeCollectionId)
  }

  return ids
}

async function readMeta(collectionName, key) {
  const { data } = await request(
    `${metaPaths[collectionName]}?fields=${key},${META_FIELDS[key === 'collectionId' ? 'collection' : 'field']}&limit=2000`,
  )

  return new Map(data.map((row) => [row[key], row]))
}

const existing = {
  collection: await readMeta('MonospaceCollectionMeta', 'collectionId'),
  field: await readMeta('MonospacePrimitiveFieldMeta', 'fieldId'),
  relation: await readMeta('MonospaceSingleRelationFieldMeta', 'fieldId'),
}

let created = 0

let updated = 0

async function upsert(kind, id, wanted) {
  const collectionName = {
    collection: 'MonospaceCollectionMeta',
    field: 'MonospacePrimitiveFieldMeta',
    relation: 'MonospaceSingleRelationFieldMeta',
  }[kind]

  const key = kind === 'collection' ? 'collectionId' : 'fieldId'
  const current = existing[kind].get(id)

  if (!current) {
    const link = kind === 'collection' ? 'collection' : 'field'
    await request(`${metaPaths[collectionName]}?fields=${key}`, {
      method: 'POST',
      body: JSON.stringify({ isHidden: false, ...wanted, [link]: { _connect: { key: { id } } } }),
    })
    created += 1

    return
  }

  const patch = Object.fromEntries(
    Object.entries(wanted).filter(([field, value]) => !sameJson(current[field], value)),
  )

  if (Object.keys(patch).length === 0) return
  await request(`${metaPaths[collectionName]}/${id}?fields=${key}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  updated += 1
}

for (const { file, schema } of schemas) {
  for (const [dbName, definition] of Object.entries(schema.collections)) {
    const collection = findCollection(file, schema.source, dbName)

    if (definition.meta) {
      const { displayTemplate, ...meta } = definition.meta

      if (displayTemplate) {
        meta.displayTemplate = renderTemplate(displayTemplate, collection, resolvePath)
      }

      await upsert('collection', collection.id, meta)
    }

    const order = new Map((definition.order ?? []).map((name, index) => [name, sortKey(index)]))

    for (const [fieldDbName, item] of Object.entries(definition.fields ?? {})) {
      const field = collection.primitiveFields.find((f) => f.dbName === fieldDbName)

      const meta = Object.fromEntries(
        Object.entries(item).filter(([key]) => !STRUCTURAL_KEYS.includes(key)),
      )

      const sort = order.get(fieldDbName)

      if (!Object.keys(meta).length && !sort) continue

      if (sort) meta.sort = sort

      await upsert('field', field.id, meta)
    }

    const relationNames = new Set([
      ...Object.keys(definition.relations ?? {}),
      ...Object.keys(definition.optionalRelations ?? {}),
    ])

    for (const apiName of relationNames) {
      const relation = schemaRelation(
        file,
        collection,
        apiName,
        definition.optionalRelations?.[apiName],
        collections,
        pieceAvailable,
      )

      const meta = definition.relations?.[apiName]

      if (!relation || !meta) continue

      const patch = { ...meta }
      const sort = order.get(apiName)

      if (sort) patch.sort = sort

      await upsert('relation', relation.id, patch)
    }
  }

  console.log(`${file}: applied`)
}

console.log(`Presentation meta: ${created} created, ${updated} updated.`)
