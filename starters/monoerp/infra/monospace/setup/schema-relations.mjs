export function schemaRelation(
  file,
  collection,
  apiName,
  optional,
  collections,
  ownerAvailable,
  renamedApiName = apiName,
) {
  const relation = collection.relationFields.find(
    (field) => field.apiName === apiName || field.apiName === renamedApiName,
  )

  if (relation) return relation

  if (optional) {
    const sourcePresent = collections.some((candidate) => candidate.source === optional.source)

    if (!sourcePresent || !ownerAvailable(optional.owner)) {
      console.log(
        `${file}: ${collection.dbName}.${apiName} skipped, optional target ${optional.source}.${optional.collection} isn't connected or selected`,
      )

      return undefined
    }
  }

  throw new Error(
    `${file}: ${collection.dbName}.${apiName} is not a relation; run the relation scripts first`,
  )
}
