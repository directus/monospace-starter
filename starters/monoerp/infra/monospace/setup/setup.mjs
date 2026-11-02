// One command from a running stack to a configured workspace. Every step is idempotent, so
// this is also how you bring an existing install up to date after pulling.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildExtensions, connectors } from './build-extensions.mjs'
import { setupSteps } from './installed.mjs'
import { apiUrl, monospaceProblem, runSetupStep } from './lib.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))

// Right after `docker compose up`, Monospace is still starting (it has no compose healthcheck).
// Unless MONOSPACE_URL points elsewhere, it must be this folder's compose Monospace: stop early
// when the port belongs to something else or the container keeps restarting.
async function waitForMonospace() {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${apiUrl}/system/ready`).catch(() => null)
    const problem = process.env.MONOSPACE_URL ? '' : localProblem(answerKind(response))

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

// Monospace answers JSON, even while it starts; anything else on the port is another app.
function answerKind(response) {
  if (!response) return 'none'

  return response.headers.get('content-type')?.startsWith('application/json')
    ? 'monospace'
    : 'other'
}

function localProblem(answer) {
  const container = composeMonospace()

  const logs =
    container?.state === 'restarting'
      ? compose(['logs', '--tail', '40', '--no-log-prefix', 'monospace'])
      : ''

  return monospaceProblem({ port: new URL(apiUrl).port, container, answer, logs })
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

// This folder's compose `monospace` service, or null when it was never created.
function composeMonospace() {
  const line = compose(['ps', '--all', '--format', 'json', 'monospace']).split('\n')[0]

  if (!line) return null

  const { State, Publishers = [] } = JSON.parse(line)
  const published = Publishers.find((publisher) => publisher.TargetPort === 8100)

  return { state: State, publishedPort: String(published?.PublishedPort ?? '') }
}

function compose(args) {
  try {
    return execFileSync('docker', ['compose', ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const coreStep = (title, name) => ({ title, url: new URL(name, import.meta.url) })

// Each step is a self-contained script; importing it runs it against the shared session.
const steps = [
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
