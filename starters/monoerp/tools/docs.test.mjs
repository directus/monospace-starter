import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

import { readManifests } from '../infra/manifests.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

const ownedRoots = readManifests().flatMap((manifest) => manifest.ownedPaths)

const roots = [
  'apps',
  'infra',
  'connectors',
  'modules',
  'tools',
  'docs',
  ...ownedRoots.map((path) => path.split('/')[0]),
]

function markdown(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build'].includes(entry.name))
      return []
    const path = resolve(directory, entry.name)

    return entry.isDirectory() ? markdown(path) : entry.name.endsWith('.md') ? [path] : []
  })
}

it('keeps literal repository paths in documentation valid', () => {
  const missing = []

  for (const file of markdown(root)) {
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '')

    for (const [, path] of text.matchAll(/`([^`\n]+)`/g)) {
      // Templates, commands, globs, and example module names are not literal paths.
      if (
        /[\s*<>{}|]/.test(path) ||
        !path.includes('/') ||
        path.split('/').includes('node_modules') ||
        path.startsWith('infra/monospace/extensions')
      )
        continue

      const first = path.split('/')[0]

      const candidates = [
        resolve(dirname(file), path),
        resolve(root, path),
        resolve(root, 'apps/web/src', path),
      ]

      if (
        !roots.includes(first) &&
        !['routes', 'lib', 'components', 'hooks', 'shell', 'settings', 'generated'].includes(first)
      )
        continue

      // A removable feature's guide may mention an optional sibling absent from this selection.
      const optional = path.match(
        /^(?:apps\/web\/src\/|infra\/)?(modules|connectors|deploy)\/([a-z][a-z0-9-]*)(?:\/|$)/,
      )

      if (optional && !existsSync(resolve(root, optional[1], optional[2]))) continue

      if (!candidates.some((candidate) => existsSync(candidate)))
        missing.push(`${file.slice(root.length)}: ${path}`)
    }
  }

  expect(missing).toEqual([])
})
