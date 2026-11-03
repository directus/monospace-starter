// `changeset version` indents every line of a multi-line summary, blank lines included, so a
// summary with paragraphs or a list leaves trailing spaces that fail each starter's `vp check`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const starters = fileURLToPath(new URL('../starters', import.meta.url))

for (const starter of readdirSync(starters)) {
  const file = join(starters, starter, 'CHANGELOG.md')

  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8')
  const trimmed = text.replace(/[ \t]+$/gm, '')

  if (trimmed !== text) {
    writeFileSync(file, trimmed)
    console.log(`Trimmed trailing spaces in starters/${starter}/CHANGELOG.md`)
  }
}
