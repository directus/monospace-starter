// Fixture builders keep runtime settings readable while writing the public document format.
export function manifestDocument(input) {
  const defaults =
    input.kind === 'module'
      ? {
          app: `apps/web/src/modules/${input.id}`,
          infra: `infra/modules/${input.id}`,
          settings: [],
          order: 0,
          collections: [],
          schemas: [],
          schemaFiles: [],
          auditTables: {},
          setup: { beforeSchema: [], afterSchema: [] },
        }
      : input.kind === 'connector'
        ? {
            source: {},
            schemaFiles: [],
            setup: { beforeSchema: [], afterSchema: [] },
          }
        : {}

  const manifest = {
    label: input.id,
    description: 'Fixture',
    ownedPaths: [
      input.kind === 'starter'
        ? 'starter.json'
        : `${
            {
              module: 'modules',
              connector: 'connectors',
              deploy: 'deploy',
            }[input.kind]
          }/${input.id}`,
    ],
    requires: [],
    optional: [],
    ...defaults,
    ...input,
  }

  const fields = new Set([
    'kind',
    'id',
    'label',
    'description',
    'ownedPaths',
    'requires',
    'packageEntries',
    'requiresWhenInstalled',
  ])

  const envelope = Object.fromEntries(Object.entries(manifest).filter(([key]) => fields.has(key)))
  const runtime = Object.fromEntries(Object.entries(manifest).filter(([key]) => !fields.has(key)))
  const conditional = { ...manifest.requiresWhenInstalled }

  if (runtime.frontend)
    runtime.frontend = runtime.frontend.map(({ requires, ...feature }) => {
      if (requires?.length) conditional[feature.module] = requires

      return feature
    })

  const document = {
    format: `urn:monospace:manifest:${manifest.kind}:1`,
    ...envelope,
    requiresWhenInstalled: conditional,
    'x-monoerp': runtime,
  }

  delete document.kind

  if (manifest.kind === 'deploy') delete runtime.optional

  if (manifest.kind === 'starter') {
    document.sourceRoots = [
      'apps/web/src/routes',
      'apps/web/src/modules',
      'infra/modules',
      'connectors',
    ]
    document.ignorePaths = []
    document.nextSteps = { create: [], remove: [] }
  }

  return document
}
