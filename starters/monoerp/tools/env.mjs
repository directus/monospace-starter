// Writes .env from .env.example on the first `pnpm install`: its own Compose project name, so a
// fresh copy never shares Docker data with another copy, and free host ports.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const portLine = /^(\w+_PORT)=(\d+)$/gm

// How far past each default to look for a free port.
const searchRange = 20

// Compose project names allow lowercase letters, digits, dashes and underscores, and start with
// a letter or digit.
export function projectName(folder, suffix) {
  const slug = folder
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')

  return `${slug || 'app'}-${suffix}`
}

// Each default if it's free, else the next free port. No two picks are the same.
export function pickPorts(defaults, taken) {
  const used = new Set(taken)

  return defaults.map(({ name, port }) => {
    let picked = port

    while (used.has(picked)) picked++

    used.add(picked)

    return { name, port: picked, changed: picked !== port }
  })
}

export function envFromExample(example, { project, ports }) {
  const byName = new Map(ports.map(({ name, port }) => [name, port]))

  const withPorts = example.replace(portLine, (line, name) =>
    byName.has(name) ? `${name}=${byName.get(name)}` : line,
  )

  const projectLine = `COMPOSE_PROJECT_NAME=${project}`

  return /^# ?COMPOSE_PROJECT_NAME=.*$/m.test(withPorts)
    ? withPorts.replace(/^# ?COMPOSE_PROJECT_NAME=.*$/m, projectLine)
    : `${withPorts.trimEnd()}\n${projectLine}\n`
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: 300 })

    const done = (open) => {
      socket.destroy()
      resolve(open)
    }

    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

export async function writeEnv(directory) {
  const envFile = new URL('.env', directory)
  const exampleFile = new URL('.env.example', directory)

  if (process.env.CI || existsSync(envFile) || !existsSync(exampleFile)) return

  const example = readFileSync(exampleFile, 'utf8')

  const defaults = [...example.matchAll(portLine)].map(([, name, port]) => ({
    name,
    port: Number(port),
  }))

  const candidates = [
    ...new Set(
      defaults.flatMap(({ port }) => Array.from({ length: searchRange }, (_, step) => port + step)),
    ),
  ]

  const open = await Promise.all(candidates.map(listening))
  const taken = candidates.filter((_, index) => open[index])
  const ports = pickPorts(defaults, taken)
  const project = projectName(basename(fileURLToPath(directory)), randomBytes(2).toString('hex'))

  writeFileSync(envFile, envFromExample(example, { project, ports }))

  const port = (name) => ports.find((entry) => entry.name === name)?.port
  const changed = ports.filter((entry) => entry.changed)

  console.log(
    [
      `Wrote .env (Compose project ${project}).`,
      ...changed.map(
        ({ name, port: picked }) =>
          `  ${name}: ${defaults.find((entry) => entry.name === name).port} was taken, using ${picked}`,
      ),
      `  App: http://localhost:${port('APP_PORT')}`,
      `  Studio: http://localhost:${port('MONOSPACE_PORT')}`,
    ].join('\n'),
  )
}
