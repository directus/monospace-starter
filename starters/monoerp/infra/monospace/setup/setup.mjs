// One command from a running stack to a configured workspace. Every step is idempotent, so
// this is also how you bring an existing install up to date after pulling.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildExtensions, connectors } from './build-extensions.mjs'
import { setupSteps } from './installed.mjs'
import { apiUrl, runSetupStep } from './lib.mjs'

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

const coreStep = (title, name) => ({
  title,
  run: () => runSetupStep(title, () => import(new URL(name, import.meta.url))),
})

const ownerStep = ({ title, owner, script }) => ({
  title,
  run: () =>
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('run-step.mjs', import.meta.url)), `${owner}/${script}`],
      { stdio: 'inherit', cwd: root },
    ),
})

const steps = [
  coreStep('Workspace and data sources', 'sources.mjs'),
  coreStep('Introspect sources', 'introspect-sources.mjs'),
  coreStep('Owner and audit user relations', 'audit-user-relations.mjs'),
  ...setupSteps('beforeSchema').map(ownerStep),
  coreStep('API names, defaults, presentation meta', 'apply-schema.mjs'),
  ...setupSteps('afterSchema').map(ownerStep),
]

for (const { title, run } of steps) {
  console.log(`\n== ${title}`)
  await run()
}

console.log('\nMonospace is set up.')
