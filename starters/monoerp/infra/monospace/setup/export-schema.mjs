// Writes each module and connector monospace/schema/<source>.json with everything that was
// set up by hand in Studio or through the API and isn't in the SQL: API names, engine-managed
// defaults, and presentation meta (labels, icons, colors, select options, display templates,
// field order, hidden flags). Keyed by dbName so it applies to any install; apply-schema.mjs
// pushes it back. Cross-source relations are not exported: they live in
// audit-user-relations.mjs and the owning pieces' relation setup scripts.
import { writeFile } from 'node:fs/promises'
import { authenticate, canonicalJson, metaPaths, readCollections, request } from './lib.mjs'

import { readSchemas } from './modules.mjs'

const schemas = await readSchemas()

const META_COLLECTION = 'displayTemplate,displayName,description,icon,isHidden,color'

const META_FIELD =
  'displayName,description,typeTemplateId,typeOptions,inputId,inputOptions,displayId,displayOptions,isHidden,sort'

const camelCase = (value) => value.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())

const byName = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

function compact(row, drop = []) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key, value]) => value != null && !drop.includes(key))
      .map(([key, value]) => [key, JSON.parse(canonicalJson(value))]),
  )
}

await authenticate()

const collections = await readCollections()

const byId = new Map(collections.map((c) => [c.id, c]))

async function readMeta(collectionName, key, fields) {
  const { data } = await request(`${metaPaths[collectionName]}?fields=${key},${fields}&limit=5000`)

  return new Map(data.map((row) => [row[key], row]))
}

const collectionMeta = await readMeta('MonospaceCollectionMeta', 'collectionId', META_COLLECTION)

const fieldMeta = await readMeta('MonospacePrimitiveFieldMeta', 'fieldId', META_FIELD)

const relationMeta = await readMeta('MonospaceSingleRelationFieldMeta', 'fieldId', META_FIELD)

// Studio's doc node with fieldId chains -> "{account.name} · {plan.name}".
function templateToString(template, collection) {
  if (!template?.content) return undefined

  return template.content
    .map((node) => {
      if (node.type === 'text') return node.text

      if (node.type !== 'ref') return ''
      let current = collection
      const path = []

      for (const id of node.attrs.fieldId) {
        const primitive = current.primitiveFields.find((f) => f.id === id)

        if (primitive) {
          path.push(primitive.dbName)
          break
        }

        const relation = current.relationFields.find((f) => f.id === id)

        if (!relation)
          throw new Error(`${collection.dbName}: template references unknown field ${id}`)
        path.push(relation.apiName)
        current = byId.get(relation.oppositeCollectionId)
      }

      return `{${path.join('.')}}`
    })
    .join('')
}

const files = new Map()

const exported = collections
  .filter((c) => !c.isSystem)
  .sort((left, right) => byName(`${left.source}.${left.dbName}`, `${right.source}.${right.dbName}`))

for (const collection of exported) {
  const entry = {}

  if (collection.apiName !== camelCase(collection.dbName)) entry.apiName = collection.apiName

  const meta = collectionMeta.get(collection.id)

  if (meta) {
    entry.meta = compact(
      { ...meta, displayTemplate: templateToString(meta.displayTemplate, collection) },
      ['collectionId'],
    )
  }

  const ordered = [
    ...collection.primitiveFields.map((f) => ({ name: f.dbName, sort: fieldMeta.get(f.id)?.sort })),
    ...collection.relationFields.map((f) => ({
      name: f.apiName,
      sort: relationMeta.get(f.id)?.sort,
    })),
  ]
    .filter((item) => item.sort)
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))

  if (ordered.length) entry.order = ordered.map((item) => item.name)

  entry.fields = {}

  for (const field of [...collection.primitiveFields].sort((a, b) => byName(a.dbName, b.dbName))) {
    const item = {}

    if (field.apiName !== camelCase(field.dbName)) item.apiName = field.apiName

    if (field.defaultValue?.source === 'engineManaged') item.defaultValue = field.defaultValue
    Object.assign(item, compact(fieldMeta.get(field.id) ?? {}, ['fieldId', 'sort']))

    if (Object.keys(item).length) entry.fields[field.dbName] = item
  }

  entry.relations = {}

  for (const relation of [...collection.relationFields].sort((a, b) =>
    byName(a.apiName, b.apiName),
  )) {
    const item = compact(relationMeta.get(relation.id) ?? {}, ['fieldId', 'sort'])

    if (Object.keys(item).length) entry.relations[relation.apiName] = item
  }

  if (!Object.keys(entry.relations).length) delete entry.relations

  if (!files.has(collection.source))
    files.set(collection.source, { source: collection.source, collections: {} })
  files.get(collection.source).collections[collection.dbName] = entry
}

for (const { url, schema: owned } of schemas) {
  const source = files.get(owned.source)

  if (!source) continue

  const schema = {
    source: owned.source,
    collections: Object.fromEntries(
      Object.keys(owned.collections).map((name) => {
        const collection = source.collections[name]

        if (!collection) throw new Error(`${url.pathname}: ${name} is missing from the workspace`)

        const optionalRelations = owned.collections[name].optionalRelations

        const definition = { ...collection }

        if (optionalRelations) {
          definition.optionalRelations = optionalRelations

          for (const relation of Object.keys(optionalRelations)) {
            const meta = owned.collections[name].relations?.[relation]

            if (meta && !definition.relations?.[relation]) {
              definition.relations ??= {}
              definition.relations[relation] = meta
            }
          }
        }

        return [name, definition]
      }),
    ),
  }

  await writeFile(url, `${JSON.stringify(schema, null, 2)}\n`)
  console.log(`${url.pathname}: ${Object.keys(schema.collections).length} collections`)
}
