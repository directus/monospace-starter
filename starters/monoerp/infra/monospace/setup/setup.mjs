// One command from a running stack to a configured workspace. Every step is idempotent, so
// this is also how you bring an existing install up to date after pulling.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { apiUrl } from './lib.mjs'
import { buildExtensions, connectors } from './build-extensions.mjs'
import { availableSetupSteps } from './connectors.mjs'
import { syncCompose } from '../../compose-sync.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// Right after `docker compose up`, Monospace is still starting (it has no compose healthcheck).
async function waitForMonospace() {
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(`${apiUrl}/system/ready`).then(
      (response) => response.ok,
      () => false,
    )

    if (ready) return

    if (attempt === 60) throw new Error(`Monospace isn't ready at ${apiUrl} after 2 minutes`)

    if (attempt === 0) console.log(`Waiting for Monospace at ${apiUrl}...`)

    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

await syncCompose()

await waitForMonospace()

// Built with the Monospace CLI, through the connector's package script. On macOS, a running
// container can miss the first build's files (the build swaps its folder in by renaming it), so
// Monospace sees the manifest without the code. Restarting this folder's Monospace fixes that.
if (connectors.some((connector) => connector.extension)) {
  console.log('\n== Data connectors')

  const firstBuild = connectors.some(
    (connector) =>
      connector.extension &&
      !existsSync(`${root}infra/monospace/extensions/${connector.extension.installed}`),
  )

  buildExtensions()

  // Only the compose Monospace that answers at this setup's address, so a second copy's setup
  // never restarts someone else's stack.
  if (firstBuild && composePort() === new URL(apiUrl).port) {
    console.log('First build: restarting Monospace so it loads the connector')
    execFileSync('docker', ['compose', 'restart', 'monospace'], { stdio: 'inherit', cwd: root })
    await waitForMonospace()
  }
} else {
  buildExtensions()
}

// The host port this folder's compose Monospace publishes, or '' when it isn't running here.
function composePort() {
  try {
    return execFileSync('docker', ['compose', 'port', 'monospace', '8100'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split(':')
      .at(-1)
  } catch {
    return ''
  }
}

const node = (title, name) => ({
  title,
  command: process.execPath,
  args: [
    fileURLToPath(new URL('step.mjs', import.meta.url)),
    title,
    fileURLToPath(new URL(name, import.meta.url)),
  ],
})

const steps = [
  node('Workspace and data sources', 'sources.mjs'),
  node('Introspect sources', 'introspect-sources.mjs'),
  node('Owner and audit user relations', 'audit-user-relations.mjs'),
  ...availableSetupSteps('beforeSchema').map(({ title, url }) => node(title, url)),
  node('API names, defaults, presentation meta', 'apply-schema.mjs'),
  ...availableSetupSteps('afterSchema').map(({ title, url }) => node(title, url)),
]

for (const { title, command, args } of steps) {
  console.log(`\n== ${title}`)
  execFileSync(command, args, { stdio: 'inherit', cwd: root })
}

console.log('\nMonospace is set up.')
