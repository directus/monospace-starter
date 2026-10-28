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

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'monoerp-lint-'))
  roots.push(root)
  const directory = join(root, 'deploy', 'example')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'deploy.json'),
    JSON.stringify(
      manifestDocument({ kind: 'deploy', id: 'example', lint: 'deploy/example/lint.mjs' }),
    ),
  )
  writeFileSync(
    join(directory, 'lint.mjs'),
    `export default { overrides: [{ files: ['deploy/example/**'], rules: { 'example/rule': 'error' } }] }`,
  )

  return root
}

it('loads core strict lint and the installed target fragment', async () => {
  const root = fixture()
  const lint = await loadLint(pathToFileURL(root + '/'))
  expect(lint.rules['strict/no-module-mocking']).toBe('error')
  expect(lint.overrides.some((override) => override.rules['example/rule'] === 'error')).toBe(true)
})

it('keeps core strict lint after removing the target', async () => {
  const root = fixture()
  rmSync(join(root, 'deploy', 'example'), { recursive: true })
  const lint = await loadLint(pathToFileURL(root + '/'))
  expect(lint.rules['strict/no-module-mocking']).toBe('error')
  expect(lint.overrides.some((override) => override.rules['example/rule'] === 'error')).toBe(false)
})
