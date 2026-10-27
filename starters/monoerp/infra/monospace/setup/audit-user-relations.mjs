import { randomUUID } from 'node:crypto'

import { modules } from './installed.mjs'
import { appSource } from './lib.mjs'
import { authenticate, canonicalJson, readCollections, request, workspace } from './lib.mjs'

const currentUserOnCreate = {
  source: 'engineManaged',
  onCreate: { kind: 'currentUser' },
}

const currentUserOnCreateAndUpdate = {
  source: 'engineManaged',
  onCreate: { kind: 'currentUser' },
  onUpdate: { kind: 'currentUser' },
}

const collections = Object.assign({}, ...modules.map((module) => module.auditTables))

const fieldConfig = {
  owner_user_id: {
    scalarApiName: 'ownerUserId',
    relationApiName: 'owner',
    defaultValue: null,
  },
  created_by: {
    scalarApiName: 'createdById',
    relationApiName: 'createdBy',
    defaultValue: currentUserOnCreate,
  },
  updated_by: {
    scalarApiName: 'updatedById',
    relationApiName: 'updatedBy',
    defaultValue: currentUserOnCreateAndUpdate,
  },
}

function upperFirst(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

await authenticate()

const data = await readCollections()

const source = appSource

const byDbName = new Map(
  data.flatMap((collection) =>
    collection.source === source ? [[collection.dbName, collection]] : [],
  ),
)

const users = data.find((collection) => collection.apiName === 'MonospaceSystemUser')

if (!users) throw new Error('MonospaceSystemUser is missing from the workspace schema')

const usersId = users.primitiveFields.find((field) => field.dbName === 'id')

if (!usersId || usersId.type?.name !== 'uuid') {
  throw new Error('MonospaceSystemUser.id is not an available UUID field')
}

const renameOperations = []

const updateOperations = []

const relationOperations = []

for (const [collectionDbName, fieldDbNames] of Object.entries(collections)) {
  const collection = byDbName.get(collectionDbName)

  if (!collection) throw new Error(`Collection ${collectionDbName} is missing`)

  const primitiveFields = collection.primitiveFields
  const relationFields = collection.relationFields
  const fieldUpdates = []

  for (const fieldDbName of fieldDbNames) {
    const config = fieldConfig[fieldDbName]
    const field = primitiveFields.find((candidate) => candidate.dbName === fieldDbName)

    if (!field) throw new Error(`${collectionDbName}.${fieldDbName} is missing`)

    if (field.type?.name !== 'uuid') {
      throw new Error(`${collectionDbName}.${fieldDbName} is not a UUID field`)
    }

    const nameCollision = primitiveFields.some(
      (candidate) => candidate.id !== field.id && candidate.apiName === config.scalarApiName,
    )

    if (nameCollision) {
      throw new Error(
        `${collectionDbName}.${config.scalarApiName} is already used by another primitive field`,
      )
    }

    if (field.apiName !== config.scalarApiName) {
      renameOperations.push({
        kind: 'renamePrimitiveField',
        data: { id: field.id, dbName: null, apiName: config.scalarApiName },
      })
    }

    if (
      config.defaultValue &&
      !canonicalJson(field.defaultValue) === canonicalJson(config.defaultValue)
    ) {
      fieldUpdates.push({
        kind: 'updatePrimitiveField',
        data: {
          id: field.id,
          operations: [
            {
              kind: 'changeDefaultValue',
              data: { defaultValue: config.defaultValue },
            },
          ],
        },
      })
    }

    const relation = relationFields.find(
      (candidate) => candidate.apiName === config.relationApiName,
    )

    if (relation) {
      if (relation.oppositeCollectionId !== users.id) {
        throw new Error(
          `${collectionDbName}.${config.relationApiName} points to the wrong collection`,
        )
      }

      continue
    }

    if (
      primitiveFields.some((candidate) => candidate.apiName === config.relationApiName) &&
      field.apiName !== config.relationApiName
    ) {
      throw new Error(
        `${collectionDbName}.${config.relationApiName} is already used by a primitive field`,
      )
    }

    const backwardApiName = `${collection.apiName}${upperFirst(config.relationApiName)}`

    if (users.relationFields.some((candidate) => candidate.apiName === backwardApiName)) {
      throw new Error(
        `MonospaceSystemUser.${backwardApiName} exists without the expected forward relation`,
      )
    }

    relationOperations.push({
      kind: 'createRelationFieldPair',
      data: {
        kind: 'single',
        data: {
          relationName: `${collectionDbName}_${fieldDbName}_user`,
          onDelete: 'setNull',
          onUpdate: 'noAction',
          firstField: {
            id: randomUUID(),
            apiName: config.relationApiName,
            isList: false,
            isConstrained: true,
            collectionId: collection.id,
            fieldIds: [field.id],
          },
          secondField: {
            id: randomUUID(),
            apiName: backwardApiName,
            isList: true,
            isConstrained: false,
            collectionId: users.id,
            fieldIds: [usersId.id],
          },
        },
      },
    })
  }

  if (fieldUpdates.length > 0) {
    updateOperations.push({
      kind: 'updateCollection',
      data: { id: collection.id, operations: fieldUpdates },
    })
  }
}

const operations = [...renameOperations, ...updateOperations, ...relationOperations]

if (operations.length === 0) {
  console.log('Monospace audit user relationships are already configured.')
} else {
  await request(`/${encodeURIComponent(workspace)}/schema/migrate`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  })

  console.log(
    `Configured ${relationOperations.length} user relationships, ${renameOperations.length} API field names, and ${updateOperations.length} collections with current-user defaults.`,
  )
}
