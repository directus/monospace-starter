// One command from a running stack to a configured workspace. Every step is idempotent, so
// this is also how you bring an existing install up to date after pulling.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { containerFolders, samePath } from '../../../tools/env.mjs'
import { buildExtensions, connectors } from './build-extensions.mjs'
import { setupSteps } from './installed.mjs'
import {
  answerKind,
  apiUrl,
  compose,
  composeMonospace,
  monospaceProblem,
  runSetupStep,
} from './lib.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// Right after `docker compose up`, Monospace is still starting (it has no compose healthcheck).
// Unless MONOSPACE_URL points elsewhere, it must be this folder's compose Monospace: stop early
// when the port belongs to something else or the container keeps restarting (two polls in a row,
// so one crash that Docker restarts from isn't enough).
async function waitForMonospace() {
  let restarting = 0

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${apiUrl}/system/ready`).catch(() => null)
    const container = process.env.MONOSPACE_URL ? null : composeMonospace()

    restarting = container?.state === 'restarting' ? restarting + 1 : 0

    const problem =
      process.env.MONOSPACE_URL || restarting === 1
        ? ''
        : localProblem(container, answerKind(response))

    if (problem) {
      console.error(`\n${problem}`)
      process.exit(1)
    }

    if (response?.ok) return

    if (attempt === 60) throw new Error(`Monospace isn't ready at ${apiUrl} after 2 minutes`)

    if (attempt === 0) console.log(`Waiting for Monospace at ${apiUrl}...`)

    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

function localProblem(container, answer) {
  const logs =
    container?.state === 'restarting'
      ? compose(['logs', '--tail', '40', '--no-log-prefix', 'monospace'])
      : ''

  return monospaceProblem({ port: new URL(apiUrl).port, container, answer, logs })
}

// A folder copied with its .env shares the other copy's Compose project, containers and data.
const elsewhere = containerFolders(
  compose(['ps', '--all', '--quiet']).split('\n').filter(Boolean),
).filter((folder) => !samePath(folder, root))

if (elsewhere.length > 0) {
  console.warn(
    [
      `Warning: this folder's Compose project also has containers from ${elsewhere.join(', ')}.`,
      'Both folders share one stack. To split them, delete .env here and rerun pnpm install.',
    ].join('\n'),
  )
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
  const monospace = composeMonospace()

  if (
    firstBuild &&
    monospace?.state === 'running' &&
    monospace.publishedPort === new URL(apiUrl).port
  ) {
    console.log('First build: restarting Monospace so it loads the connector')
    execFileSync('docker', ['compose', 'restart', 'monospace'], { stdio: 'inherit', cwd: root })
    await waitForMonospace()
  }
} else {
  buildExtensions()
}

const coreStep = (title, name) => ({ title, url: new URL(name, import.meta.url) })

// Each step is a self-contained script; importing it runs it against the shared session.
const steps = [
  ...setupSteps('beforeSources'),
  coreStep('Workspace and data sources', 'sources.mjs'),
  coreStep('Introspect sources', 'introspect-sources.mjs'),
  coreStep('Owner and audit user relations', 'audit-user-relations.mjs'),
  ...setupSteps('beforeSchema'),
  coreStep('API names, defaults, presentation meta', 'apply-schema.mjs'),
  ...setupSteps('afterSchema'),
]

for (const { title, url } of steps) {
  console.log(`\n== ${title}`)
  await runSetupStep(title, () => import(url))
}

console.log('\nMonospace is set up.')
