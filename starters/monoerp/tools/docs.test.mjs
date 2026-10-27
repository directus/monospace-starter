import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))

const roots = ['apps', 'infra', 'connectors', 'modules', 'tools', 'docs', 'addons', 'tooling']

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
        path.includes('inventory') ||
        path.split('/').includes('node_modules') ||
        path.startsWith('infra/monospace/extensions')
      )
        continue

      const optionalTool = [
        ['infra/aws', 'addons/aws'],
        ['tools/oxlint', 'addons/anti-slop'],
        ['tooling/workshop', 'addons/workshop'],
      ].find(([prefix]) => path.startsWith(prefix))

      if (optionalTool && !existsSync(resolve(root, optionalTool[1]))) continue

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
        /^(?:apps\/web\/src\/|infra\/)?(modules|connectors|addons)\/([a-z][a-z0-9-]*)(?:\/|$)/,
      )

      if (optional && !existsSync(resolve(root, optional[1], optional[2]))) continue

      const routeModule = path.match(
        /^(?:apps\/web\/src\/)?routes\/_app\/(?:settings\.)?([a-z][a-z0-9-]*)(?:\/|_\.|\.|$)/,
      )

      if (
        routeModule &&
        !['settings', 'index'].includes(routeModule[1]) &&
        !existsSync(resolve(root, 'modules', routeModule[1]))
      )
        continue

      if (!candidates.some((candidate) => existsSync(candidate)))
        missing.push(`${file.slice(root.length)}: ${path}`)
    }
  }

  expect(missing).toEqual([])
})
