import { randomUUID } from 'node:crypto'

import { modules } from './installed.mjs'
import { appSource, authenticate, migrate, readCollections } from './lib.mjs'

// Audit columns link to Monospace users; their engine-managed defaults come from each module's
// schema file through apply-schema.mjs.
const collections = Object.assign({}, ...modules.map((module) => module.auditColumns))

const fieldConfig = {
  owner_user_id: { scalarApiName: 'ownerUserId', relationApiName: 'owner' },
  created_by: { scalarApiName: 'createdById', relationApiName: 'createdBy' },
  updated_by: { scalarApiName: 'updatedById', relationApiName: 'updatedBy' },
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

const relationOperations = []

for (const [collectionDbName, fieldDbNames] of Object.entries(collections)) {
  const collection = byDbName.get(collectionDbName)

  if (!collection) throw new Error(`Collection ${collectionDbName} is missing`)

  const primitiveFields = collection.primitiveFields
  const relationFields = collection.relationFields

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
}

await migrate([...renameOperations, ...relationOperations], 'Audit user relations')
