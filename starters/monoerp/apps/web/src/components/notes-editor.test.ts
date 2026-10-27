import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const src = fileURLToPath(new URL('../', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(path)

    return /\.tsx?$/.test(entry.name) && !/\.(test|browser)\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('notes editor', () => {
  // BlockNote is the biggest dependency; a static import anywhere else puts it in the record
  // pages' bundles again. Load the editor through `components/notes-editor.tsx`.
  it('keeps BlockNote out of every bundle but its own lazy chunk', () => {
    const importers = sourceFiles(src)
      .filter((path) => /from '@blocknote\//.test(readFileSync(path, 'utf8')))
      .map((path) => relative(src, path))

    expect(importers).toEqual(['components/notes-block-editor.tsx'])
  })
})
