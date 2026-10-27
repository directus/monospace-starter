import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, expect, it } from 'vitest'

import { loadAddonLint } from './lint-addons.ts'
import { manifestDocument } from './manifest-fixtures.mjs'

const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it.each(['none', 'strict', 'deploy'])(
  'loads the remaining lint when %s is absent',
  async (removed) => {
    const root = mkdtempSync(join(tmpdir(), 'monoerp-lint-'))
    roots.push(root)

    for (const id of ['strict', 'deploy']) {
      const directory = join(root, 'addons', id)
      mkdirSync(directory, { recursive: true })
      writeFileSync(
        join(directory, 'addon.json'),
        JSON.stringify(
          manifestDocument({
            kind: 'addon',
            id,
            lint: `addons/${id}/lint.mjs`,
          }),
        ),
      )
      writeFileSync(
        join(directory, 'lint.mjs'),
        id === 'strict'
          ? `export default { rules: { 'strict/example': 'error' } }`
          : `export default { overrides: [{ files: ['infra/deploy/**'], rules: { 'deploy/example': 'error' } }] }`,
      )
    }

    if (removed !== 'none') rmSync(join(root, 'addons', removed), { recursive: true })

    const lint = await loadAddonLint(pathToFileURL(root + '/'))
    expect(lint.rules['strict/example']).toBe(removed === 'strict' ? undefined : 'error')
    expect(lint.overrides.some((override) => override.rules['deploy/example'] === 'error')).toBe(
      removed !== 'deploy',
    )
  },
)
