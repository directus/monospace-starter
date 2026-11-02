// Docker Desktop and OrbStack publish a port even when a host app already listens on it, and then
// the host app answers. Compose reports healthy either way, so ask each published port whether
// it's the service compose put there. Monospace's own port is checked before setup starts.
import { connect } from 'node:net'

import { compose } from './lib.mjs'

// Opens a connection, optionally writes `hello`, and resolves with the first bytes back, or null
// when nothing accepts the connection.
function firstBytes(port, hello) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: 2_000 })
    let connected = false

    const done = (data) => {
      socket.destroy()
      resolve(connected ? (data ?? Buffer.alloc(0)) : null)
    }

    socket.once('connect', () => {
      connected = true

      if (hello) socket.write(hello)
    })
    socket.once('data', done)
    socket.once('timeout', () => done())
    socket.once('error', () => done())
    socket.once('end', () => done())
  })
}

// Each probe answers 'ours', 'other' (something else accepted), or 'none' (nothing listens).
const answer = (reply, ours) => (reply === null ? 'none' : ours(reply) ? 'ours' : 'other')

// A startup message as user postgres. The image requires a password from outside the container,
// so it asks for SCRAM (an 'R' message with code 10). A local Postgres usually trusts localhost.
async function postgres(port) {
  const parameters = Buffer.from('user\0postgres\0database\0postgres\0\0')
  const header = Buffer.alloc(8)

  header.writeInt32BE(8 + parameters.length, 0)
  header.writeInt32BE(196_608, 4)

  return answer(
    await firstBytes(port, Buffer.concat([header, parameters])),
    (reply) => reply.length >= 9 && reply[0] === 0x52 && reply.readInt32BE(5) === 10,
  )
}

// MySQL speaks first: a handshake packet with protocol version 10.
async function mysql(port) {
  return answer(await firstBytes(port), (reply) => reply.length > 4 && reply[4] === 10)
}

function http(path, matches) {
  return async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(2_000),
    }).catch(() => null)

    if (!response) return (await firstBytes(port)) === null ? 'none' : 'other'

    return (await matches(response)) ? 'ours' : 'other'
  }
}

const json = (key) => async (response) => key in ((await response.json().catch(() => null)) ?? {})

// By image, so any part's service on one of these gets checked. Others (like a locally built
// emulator) are only checked for being on the port .env says.
const probes = [
  [/^(postgres|pgvector\/pgvector)[:@]/, postgres],
  [/^mysql[:@]/, mysql],
  [/^axllent\/mailpit[:@]/, http('/api/v1/webui', json('MessageRelay'))],
  [
    /^caddy[:@]/,
    http('/', ({ headers }) => /caddy/i.test(`${headers.get('server')} ${headers.get('via')}`)),
  ],
]

export function probeFor(image = '') {
  return probes.find(([pattern]) => pattern.test(image))?.[1]
}

export function portName(port, env = process.env) {
  return Object.keys(env).find((name) => name.endsWith('_PORT') && env[name] === String(port))
}

function containers() {
  return compose(['ps', '--format', 'json'])
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line)

        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return []
      }
    })
}

// One line per published port that isn't answered by this project's running service.
export async function portProblems() {
  let config

  try {
    config = JSON.parse(compose(['--profile', '*', 'config', '--format', 'json']))
  } catch {
    return []
  }

  const problems = []

  for (const container of containers()) {
    if (container.State !== 'running' || container.Service === 'monospace') continue

    const service = config.services?.[container.Service]
    const probe = probeFor(service?.image)

    for (const { published, target } of service?.ports ?? []) {
      const port = Number(published)
      const name = portName(port) ?? 'its port'

      const actual = (container.Publishers ?? []).find(
        (publisher) => publisher.TargetPort === target && publisher.PublishedPort,
      )?.PublishedPort

      if (actual !== port) {
        problems.push(
          `${container.Service} is on port ${actual}, but ${name} in .env says ${port}. Run: docker compose up -d`,
        )
        continue
      }

      const found = probe ? await probe(port) : 'ours'

      const lookup =
        process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -i :${port}`

      // Docker didn't get the port (something had it when the container started) and doesn't
      // retry once it's free.
      if (found === 'none')
        problems.push(
          `Nothing answers on port ${port} (${name}), where this project's ${container.Service} should be. Run: docker compose up -d --force-recreate ${container.Service}`,
        )

      if (found === 'other')
        problems.push(
          `Port ${port} (${name}) isn't this project's ${container.Service}; another app on this machine answers there. See what: ${lookup}. Fix: stop it, or change ${name} in .env, then run docker compose up -d --force-recreate ${container.Service}.`,
        )
    }
  }

  return problems
}
