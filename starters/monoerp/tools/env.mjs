// Writes .env from .env.example on the first `pnpm install`: its own Compose project name, so a
// fresh copy never shares Docker data with another copy, and free host ports.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
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

// The name Compose itself uses when COMPOSE_PROJECT_NAME isn't set.
export function folderProjectName(folder) {
  return folder
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[_-]+/, '')
}

// A checkout that ran before .env was written has its stack under the folder name. Keep using it
// when it's this folder's: its containers were started here, or only its volumes are left.
export function keepsFolderProject({ folders, volumes, here }) {
  if (folders.length > 0) return folders.some((folder) => samePath(folder, here))

  return volumes > 0
}

export function samePath(a, b) {
  const real = (path) => {
    try {
      return realpathSync(path)
    } catch {
      return resolve(path)
    }
  }

  return real(a) === real(b)
}

// Each default if it's free, else the next free port within searchRange (all of which were
// checked), else null. No two picks are the same.
export function pickPorts(defaults, taken) {
  const used = new Set(taken)

  return defaults.map(({ name, port }) => {
    const picked =
      Array.from({ length: searchRange }, (_, step) => port + step).find(
        (candidate) => !used.has(candidate),
      ) ?? null

    if (picked !== null) used.add(picked)

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

// Lines of `docker` output, or none when Docker isn't there or fails.
function docker(args) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

// The folders Compose started these containers from.
export function containerFolders(ids) {
  if (ids.length === 0) return []

  const format = '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'

  return [...new Set(docker(['inspect', '--format', format, ...ids]))]
}

function folderProject(here) {
  const name = folderProjectName(basename(here))

  if (!name) return null

  const filter = ['--filter', `label=com.docker.compose.project=${name}`]
  const folders = containerFolders(docker(['ps', '--all', '--quiet', ...filter]))
  const volumes = docker(['volume', 'ls', '--quiet', ...filter]).length

  return keepsFolderProject({ folders, volumes, here }) ? name : null
}

// Host ports in `docker inspect`'s HostConfig.PortBindings JSON.
export function boundPorts(json) {
  try {
    return Object.values(JSON.parse(json) ?? {})
      .flat()
      .map((binding) => Number(binding?.HostPort))
      .filter(Boolean)
  } catch {
    return []
  }
}

// Ports any Compose container publishes, running or stopped, so a stack that's down right now
// keeps its ports. Empty when Docker isn't there.
function composePorts() {
  const ids = docker(['ps', '--all', '--quiet', '--filter', 'label=com.docker.compose.project'])

  if (ids.length === 0) return []

  return docker(['inspect', '--format', '{{json .HostConfig.PortBindings}}', ...ids]).flatMap(
    boundPorts,
  )
}

// Ports in the .env of folders next to this one: other copies, even if never started.
export function siblingPorts(here) {
  const parent = dirname(here)

  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !samePath(join(parent, entry.name), here))
      .flatMap((entry) => {
        try {
          const env = readFileSync(join(parent, entry.name, '.env'), 'utf8')

          return [...env.matchAll(portLine)].map(([, , port]) => Number(port))
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

function accepts(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 300 })

    const done = (open) => {
      socket.destroy()
      resolve(open)
    }

    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

// Dev servers on `localhost` often listen on ::1 only, so check both loopbacks.
export async function listening(port) {
  const answers = await Promise.all([accepts('127.0.0.1', port), accepts('::1', port)])

  return answers.some(Boolean)
}

export async function writeEnv(directory) {
  const envFile = new URL('.env', directory)
  const exampleFile = new URL('.env.example', directory)

  if (process.env.CI || existsSync(envFile) || !existsSync(exampleFile)) return

  const example = readFileSync(exampleFile, 'utf8')
  const here = fileURLToPath(directory)

  const defaults = [...example.matchAll(portLine)].map(([, name, port]) => ({
    name,
    port: Number(port),
  }))

  const kept = folderProject(here)

  if (kept) {
    writeFileSync(envFile, envFromExample(example, { project: kept, ports: defaults }))
    console.log(
      `Wrote .env with Compose project ${kept}, the one this folder already uses, and its default ports.`,
    )

    return
  }

  const candidates = [
    ...new Set(
      defaults.flatMap(({ port }) => Array.from({ length: searchRange }, (_, step) => port + step)),
    ),
  ]

  const open = await Promise.all(candidates.map(listening))
  const reserved = new Set([...composePorts(), ...siblingPorts(here)])
  const taken = candidates.filter((port, index) => open[index] || reserved.has(port))
  const ports = pickPorts(defaults, taken)
  const stuck = ports.filter((entry) => entry.port === null)

  if (stuck.length > 0) {
    console.error(
      [
        `Couldn't write .env: no free port for ${stuck.map(({ name }) => name).join(', ')}.`,
        ...stuck.map(({ name }) => {
          const from = defaults.find((entry) => entry.name === name).port

          return `  ${name}: ${from} to ${from + searchRange - 1} are all taken`
        }),
        'Free some up and rerun pnpm install, or copy .env.example to .env and pick ports yourself.',
      ].join('\n'),
    )
    process.exit(1)
  }

  const project = projectName(basename(here), randomBytes(2).toString('hex'))

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
      `  Mailpit: http://localhost:${port('MAILPIT_PORT')}`,
    ].join('\n'),
  )
}
