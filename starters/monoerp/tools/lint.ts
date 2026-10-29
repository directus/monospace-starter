import { dirname } from 'node:path'

import type { ViteUserConfig } from 'vite-plus'

import { readManifests } from '../infra/manifests.mjs'
import strictLint from './oxlint/lint.config'

type LintFragment = NonNullable<ViteUserConfig['lint']>

export async function loadLint(root = new URL('../', import.meta.url)) {
  const paths = readManifests(root).flatMap((manifest) =>
    manifest.kind === 'deploy' && manifest.lint ? [manifest.lint] : [],
  )

  const fragments: LintFragment[] = [
    strictLint,
    ...(await Promise.all(
      paths.map(async (path) => (await import(new URL(path, root).href)).default),
    )),
  ]

  const rules: NonNullable<LintFragment['rules']> = Object.assign(
    {},
    ...fragments.map((fragment) => fragment.rules ?? {}),
  )

  const disabled: NonNullable<LintFragment['rules']> = {}

  for (const rule of Object.keys(rules)) disabled[rule] = 'off'

  return {
    jsPlugins: fragments.flatMap((fragment) => fragment.jsPlugins ?? []),
    rules,
    ignorePatterns: fragments.flatMap((fragment) => fragment.ignorePatterns ?? []),
    overrides: [
      ...fragments.flatMap((fragment) => fragment.overrides ?? []),
      {
        // AST visitors and external connector code follow the base rules, not app conventions.
        files: [
          'connectors/*/extension/src/**',
          'tools/oxlint/**',
          ...paths.map((path) => `${dirname(path)}/**`),
        ],
        rules: disabled,
      },
    ],
  }
}
