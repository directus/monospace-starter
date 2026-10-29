import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

import { modules } from '@/lib/modules'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))

// The registry glob is a relative path; a wrong depth yields an empty registry without an error.
it('registers every module folder that has a UI entry', () => {
  const expected = readdirSync(`${root}modules`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${root}modules/${entry.name}/module.ts`))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))

  expect(modules.map((module) => String(module.id)).sort((a, b) => a.localeCompare(b))).toEqual(
    expected,
  )
})
