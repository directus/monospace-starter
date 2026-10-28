import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, expect, it } from 'vitest'

import { loadLint } from './lint.ts'
import { manifestDocument } from './manifest-fixtures.mjs'

const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it.each(['none', 'deploy'])('loads the remaining lint when %s is absent', async (removed) => {
  const root = mkdtempSync(join(tmpdir(), 'monoerp-lint-'))
  roots.push(root)

  for (const id of ['deploy']) {
    const directory = join(root, 'deploy', id)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'deploy.json'),
      JSON.stringify(
        manifestDocument({
          kind: 'deploy',
          id,
          lint: `deploy/${id}/lint.mjs`,
        }),
      ),
    )
    writeFileSync(
      join(directory, 'lint.mjs'),
      `export default { overrides: [{ files: ['deploy/example/**'], rules: { 'deploy/example': 'error' } }] }`,
    )
  }

  if (removed !== 'none') rmSync(join(root, 'deploy', removed), { recursive: true })

  const lint = await loadLint(pathToFileURL(root + '/'))
  expect(lint.rules['strict/no-module-mocking']).toBe('error')
  expect(lint.overrides.some((override) => override.rules['deploy/example'] === 'error')).toBe(
    removed !== 'deploy',
  )
})
