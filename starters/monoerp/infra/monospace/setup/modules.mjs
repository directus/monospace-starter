import { readFile } from 'node:fs/promises'

import { readPieces, repository } from '../../pieces.mjs'

export const modules = readPieces().flatMap((piece) =>
  piece.kind === 'module' ? [{ ...piece, directory: new URL(`${piece.infra}/`, repository) }] : [],
)

export async function readSchemas() {
  const schemas = []
  const { connectors } = await import('./connectors.mjs')

  for (const piece of [...modules, ...connectors]) {
    for (const path of piece.schemaFiles) {
      const url = new URL(path, repository)
      const schema = JSON.parse(await readFile(url, 'utf8'))
      schemas.push({ file: `${piece.id}/${path.split('/').at(-1)}`, url, schema })
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
