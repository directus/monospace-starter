import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { connectors, logMissingConnectors } from './connectors.mjs'

const builds = new URL('../extensions/', import.meta.url)

export function buildExtensions() {
  logMissingConnectors()

  const extensions = connectors.filter((connector) => connector.extension)
  const active = new Set(extensions.map((connector) => connector.extension.installed))

  // This directory contains generated builds only. Removed manifests must stop being loaded too.
  for (const entry of readdirSync(builds, { withFileTypes: true })) {
    if (entry.isDirectory() && !active.has(entry.name)) {
      rmSync(new URL(entry.name, builds), { recursive: true })
      console.log(`${entry.name}: removed stale connector build`)
    }
  }

  for (const connector of extensions) {
    execFileSync(
      'pnpm',
      [
        '--dir',
        fileURLToPath(new URL(connector.extension.directory, connector.directory)),
        'build',
      ],
      {
        stdio: 'inherit',
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      },
    )
  }
}

export { connectors }

if (process.argv[1] === fileURLToPath(import.meta.url)) buildExtensions()
