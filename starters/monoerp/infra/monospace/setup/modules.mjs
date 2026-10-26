import { readFile } from 'node:fs/promises'

import { readManifests, repository } from '../../manifests.mjs'

export const modules = readManifests().flatMap((manifest) =>
  manifest.kind === 'module'
    ? [{ ...manifest, directory: new URL(`${manifest.infra}/`, repository) }]
    : [],
)

export async function readSchemas() {
  const schemas = []
  const { connectors } = await import('./connectors.mjs')

  for (const manifest of [...modules, ...connectors]) {
    for (const path of manifest.schemaFiles) {
      const url = new URL(path, repository)
      const schema = JSON.parse(await readFile(url, 'utf8'))
      schemas.push({ file: `${manifest.id}/${path.split('/').at(-1)}`, url, schema })
    }
  }

  return schemas
}

export function moduleSteps(phase) {
  return modules.flatMap((module) =>
    module.setup[phase].map(({ title, script, requires = [] }) => ({
      owner: module.id,
      script,
      title,
      requires,
      url: new URL(`monospace/setup/${script}`, module.directory),
    })),
  )
}
