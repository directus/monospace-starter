import { existsSync, readdirSync, readFileSync } from 'node:fs'

export const repository = new URL('../', import.meta.url)

export function readPieces(root = repository) {
  const paths = existsSync(new URL('core/piece.json', root)) ? ['core/piece.json'] : []

  for (const base of ['modules', 'connectors', 'tooling']) {
    const directory = new URL(`${base}/`, root)

    if (!existsSync(directory)) continue

    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory()) continue
      const path = `${base}/${entry.name}/piece.json`

      if (existsSync(new URL(path, root))) paths.push(path)
      else
        console.warn(`${base}/${entry.name}: ignored, no piece.json (remove the leftover folder)`)
    }
  }

  return paths.map((path) => {
    const piece = JSON.parse(readFileSync(new URL(path, root), 'utf8'))

    const expected =
      piece.kind === 'core'
        ? 'core/piece.json'
        : `${piece.kind === 'module' ? 'modules' : piece.kind === 'tooling' ? 'tooling' : 'connectors'}/${piece.id}/piece.json`

    if (path !== expected) throw new Error(`${path}: kind and id must match the manifest location`)

    return piece
  })
}

export function requestedConnectors(modules, override) {
  return new Set(
    override === undefined
      ? modules.flatMap((module) => [...module.requires, ...module.optional])
      : override
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
  )
}

// Source JSON uses env/default leaves and when/value/otherwise branches; no app code is loaded.
export function resolveSource(value, env = process.env) {
  if (Object(value) !== value) return value

  if (Object.hasOwn(value, 'env')) {
    const configured = env[value.env]

    const resolved =
      (value.emptyUsesDefault && !configured ? undefined : configured) ?? value.default

    return Number.isFinite(value.default) ? Number(resolved) : resolved
  }

  if (Object.hasOwn(value, 'when')) {
    return resolveSource(env[value.when] ? value.value : value.otherwise, env)
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const resolved = resolveSource(child, env)

      return resolved === undefined ? [] : [[key, resolved]]
    }),
  )
}

export function selectConnectors(pieces, override) {
  const requested = requestedConnectors(
    pieces.filter((piece) => piece.kind === 'module'),
    override,
  )

  return pieces.filter((piece) => piece.kind === 'connector' && requested.has(piece.id))
}

export function selectSetupStep(selector, pieces, selected) {
  if (!/^[a-z][a-z0-9-]*\/[a-zA-Z0-9_/-]+\.mjs$/.test(selector) || selector.includes('..')) {
    throw new Error('Setup steps must be owner-qualified, for example crm/backfill-owners.mjs')
  }

  const separator = selector.indexOf('/')
  const owner = pieces.find((piece) => piece.id === selector.slice(0, separator))

  if (!owner) return undefined
  const script = selector.slice(separator + 1)

  const step = [...(owner.setup?.beforeSchema ?? []), ...(owner.setup?.afterSchema ?? [])].find(
    (step) => step.script === script,
  )

  if (!step) throw new Error(`Unknown setup step: ${selector}`)

  if (
    (owner.kind === 'connector' && !selected.includes(owner.id)) ||
    !(step.requires ?? []).every((id) => selected.includes(id))
  )
    return undefined

  return { ...step, owner }
}
