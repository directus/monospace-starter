import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPieces, repository } from '../infra/pieces.mjs'

export function combinations(pieces) {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]))
  const result = []
  const selections = new Set()

  function add(name, remove) {
    if (!remove) return
    const key = [...remove].sort((left, right) => left.localeCompare(right)).join(',')

    if (selections.has(key)) return
    selections.add(key)
    result.push({ name, remove })
  }

  function selection(module, omitted = []) {
    const kept = new Set(['core'])

    function keep(id) {
      const piece = byId.get(id)

      if (!piece || omitted.includes(id) || kept.has(id)) return
      kept.add(id)

      for (const dependency of [...piece.requires, ...piece.optional]) keep(dependency)
    }

    if (module) keep(module.id)

    // A required dependency cannot be switched off as an optional variation.
    if (pieces.some((piece) => kept.has(piece.id) && piece.requires.some((id) => !kept.has(id))))
      return undefined

    const pending = pieces.filter((piece) => !kept.has(piece.id))
    const remove = []

    while (pending.length) {
      const index = pending.findIndex(
        (piece) => !pending.some((other) => other.requires.includes(piece.id)),
      )

      if (index < 0) throw new Error('Circular required piece dependencies')
      remove.push(pending.splice(index, 1)[0].id)
    }

    return remove
  }

  add('everything', [])
  add('core-only', selection())

  for (const module of pieces.filter((piece) => piece.kind === 'module')) {
    add(`${module.id}-only`, selection(module))
    const optional = module.optional.filter((id) => byId.has(id))

    for (const id of optional) add(`${module.id}-without-${id}`, selection(module, [id]))

    if (optional.length > 1)
      add(`${module.id}-without-${optional.join('-')}`, selection(module, optional))
  }

  return result
}

async function runCombination(name, pieces) {
  const combo = combinations(pieces).find((candidate) => candidate.name === name)

  if (!combo) {
    const match = /^([a-z][a-z0-9-]*)-(?:only|without-([a-z][a-z0-9-]*))$/.exec(name)

    if (
      match &&
      (!pieces.some((piece) => piece.id === match[1]) ||
        (match[2] && !pieces.some((piece) => piece.id === match[2])))
    ) {
      console.log(`SKIP ${name}: referenced piece is absent`)

      return
    }

    throw new Error(`Unknown combination: ${name}`)
  }

  const source = fileURLToPath(repository)
  const scratch = mkdtempSync(join(tmpdir(), 'monoerp-combo-'))
  const project = process.env.PIECES_COMBO_PROJECT ?? 'ms-ci'
  console.log(`Combination ${name}, scratch ${scratch}, project ${project}`)
  const example = readFileSync(join(source, '.env.example'), 'utf8')
  const env = { ...process.env, CI: 'true' }
  delete env.NODE_ENV

  // Never inherit local credentials, remote source addresses, or Compose selection.
  for (const key of Object.keys(env)) {
    if (
      /^(MONOSPACE_|CRM_|CUSTOMER_|PORTAL_|STRIPE_|COMPOSE_|OPTIONAL_SOURCES$|MAILPIT_|DB_SSL_|LOGO_DEV_TOKEN$)/.test(
        key,
      )
    )
      delete env[key]
  }

  const settings = Object.fromEntries(
    [...example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((match) => [match[1], match[2]]),
  )

  delete settings.OPTIONAL_SOURCES
  delete settings.MONOSPACE_LICENSE__KEY
  const firstPort = Number(process.env.PIECES_COMBO_PORT ?? 41000)
  let port = firstPort

  for (const key of Object.keys(settings)) {
    if (!key.endsWith('_PORT')) continue
    settings[key] = String(port++)
  }

  for (let candidate = firstPort; candidate < port; candidate++) {
    const probe = createServer()
    probe.listen(candidate, '127.0.0.1')
    await once(probe, 'listening')
    await new Promise((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    )
  }

  settings.MONOSPACE_URL = `http://127.0.0.1:${settings.MONOSPACE_PORT}`
  settings.MONOSPACE_API_KEY = ''
  settings.COMPOSE_PROJECT_NAME = project
  settings.COMPOSE_FILE = `${join(scratch, 'docker-compose.yml')}:${join(scratch, 'network.yml')}`
  Object.assign(env, settings)
  // Node 25's experimental localStorage breaks jsdom; CI uses the repo's Node 24 pin.
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --no-experimental-webstorage`.trim()

  const store = execFileSync('pnpm', ['store', 'path'], {
    cwd: source,
    env,
    encoding: 'utf8',
  }).trim()

  env.npm_config_store_dir = dirname(store)

  function run(command, args, capture = false) {
    console.log(`\n> ${command} ${args.join(' ')}`)

    return execFileSync(command, args, {
      cwd: scratch,
      env,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      timeout: 15 * 60_000,
    })
  }

  // Refuse an existing project rather than deleting another run's containers or volumes.
  for (const resource of ['container', 'volume', 'network']) {
    if (
      run(
        'docker',
        [resource, 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`],
        true,
      ).trim()
    )
      throw new Error(`Project ${project} already has ${resource} resources; stop that run first`)
  }

  const paths = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '.',
      ':(exclude).pnpm-store',
    ],
    {
      cwd: source,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean)

  for (const path of new Set(paths)) {
    if (!existsSync(join(source, path))) continue
    mkdirSync(dirname(join(scratch, path)), { recursive: true })
    copyFileSync(join(source, path), join(scratch, path))
  }

  writeFileSync(
    join(scratch, '.npmrc'),
    `${readFileSync(join(source, '.npmrc'), 'utf8')}\nstore-dir=${dirname(store)}\n`,
  )

  writeFileSync(
    join(scratch, '.env'),
    Object.entries(settings)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  )
  writeFileSync(
    join(scratch, 'network.yml'),
    `networks:\n  monospace:\n    ipam:\n      config:\n        - subnet: ${process.env.PIECES_COMBO_SUBNET ?? '10.253.46.0/24'}\n`,
  )
  const docker = execFileSync('which', ['docker'], { encoding: 'utf8' }).trim()
  const quotedDocker = `'${docker.replaceAll("'", "'\\''")}'`
  mkdirSync(join(scratch, 'bin'))
  writeFileSync(
    join(scratch, 'bin/docker'),
    `#!/bin/sh\nif [ "$1" = compose ]; then\n  shift\n  exec ${quotedDocker} compose -p ${project} "$@"\nfi\nexec ${quotedDocker} "$@"\n`,
    { mode: 0o755 },
  )
  env.PATH = `${join(scratch, 'bin')}:${env.PATH}`
  let started = false
  let server
  let serverExit

  try {
    run('pnpm', ['install', '--frozen-lockfile'])
    run('pnpm', ['pieces:check'])

    for (const id of combo.remove) run('pnpm', ['pieces:remove', id])
    run('pnpm', ['install', '--frozen-lockfile'])
    run('pnpm', ['pieces:check'])
    run('pnpm', ['compose:sync'])
    started = true
    run('docker', ['compose', '-p', project, 'up', '-d', '--wait', '--wait-timeout', '180'])
    run('pnpm', ['setup:all'])
    run('pnpm', ['generate:routes'])
    run('pnpm', ['generate'])
    run('pnpm', ['check'])
    run('pnpm', ['typecheck'])
    run('pnpm', ['test', 'run'])
    run('pnpm', ['--filter', '@monoerp/web', 'build'])
    server = spawn(process.execPath, ['apps/web/.output/server/index.mjs'], {
      cwd: scratch,
      env: {
        ...env,
        NODE_ENV: 'production',
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: settings.APP_PORT,
      },
      stdio: 'inherit',
    })
    serverExit = once(server, 'exit')
    const address = `http://127.0.0.1:${settings.APP_PORT}`

    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw new Error(`Built server exited ${server.exitCode}`)

      const ready = await fetch(`${address}/login`, { signal: AbortSignal.timeout(2000) }).then(
        (response) => response.ok,
        () => false,
      )

      if (ready) break

      if (attempt === 59) throw new Error('Built server did not become ready')
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    const routes = [
      { path: '/', status: '200' },
      { path: '/login', status: '200' },
    ]

    for (const module of pieces.filter((piece) => piece.kind === 'module')) {
      const entry = readFileSync(join(source, module.app, 'module.ts'), 'utf8')
      const path = /basePath:\s*['"]([^'"]+)['"]/.exec(entry)?.[1]

      if (!path) throw new Error(`${module.id}: module.ts must declare a literal basePath`)
      routes.push({ path, status: combo.remove.includes(module.id) ? '404' : '200' })
    }

    for (const { path, status } of routes) {
      const actual = run(
        'curl',
        [
          '--silent',
          '--show-error',
          '--max-time',
          '30',
          '--output',
          '/dev/null',
          '--write-out',
          '%{http_code}',
          `${address}${path}`,
        ],
        true,
      )

      if (actual !== status) throw new Error(`${path}: expected HTTP ${status}, received ${actual}`)
      console.log(`${path}: HTTP ${actual}`)
    }

    console.log(`PASS ${name}`)
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM')
      const force = setTimeout(() => server.kill('SIGKILL'), 5000)
      await serverExit
      clearTimeout(force)
    }

    if (started) run('docker', ['compose', '-p', project, 'down', '--volumes', '--remove-orphans'])
    console.log(`Scratch evidence retained at ${scratch}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [name, ...extra] = process.argv.slice(2)

    if (!name || extra.length)
      throw new Error('Usage: pnpm pieces:combo <name> | node tools/combo.mjs --list')
    const pieces = readPieces()

    if (name === '--list')
      console.log(JSON.stringify(combinations(pieces).map((combo) => combo.name)))
    else await runCombination(name, pieces)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
