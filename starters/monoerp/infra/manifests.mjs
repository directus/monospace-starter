import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { manifestSchema } from '../tools/manifest-schema.mjs'

export const repository = new URL('../', import.meta.url)

export function manifestPath(manifest) {
  if (manifest.kind === 'starter') return 'starter.json'

  return `${{ module: 'modules', connector: 'connectors', addon: 'addons' }[manifest.kind]}/${manifest.id}/${manifest.kind}.json`
}

export function readManifests(root = repository) {
  const paths = existsSync(new URL('starter.json', root)) ? ['starter.json'] : []

  for (const [base, kind] of [
    ['modules', 'module'],
    ['connectors', 'connector'],
    ['addons', 'addon'],
  ]) {
    const directory = new URL(`${base}/`, root)

    if (!existsSync(directory)) continue

    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory()) continue
      const path = `${base}/${entry.name}/${kind}.json`

      if (existsSync(new URL(path, root))) paths.push(path)
      else
        console.warn(`${base}/${entry.name}: ignored, no ${kind}.json (remove the leftover folder)`)
    }
  }

  return paths.map((path) => {
    const manifest = manifestSchema.parse(JSON.parse(readFileSync(new URL(path, root), 'utf8')))

    if (path !== manifestPath(manifest))
      throw new Error(`${path}: kind and id must match the manifest location`)

    return manifest
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

export function selectConnectors(manifests, override) {
  const requested = requestedConnectors(
    manifests.filter((manifest) => manifest.kind === 'module'),
    override,
  )

  return manifests.filter((manifest) => manifest.kind === 'connector' && requested.has(manifest.id))
}

export function selectSetupStep(selector, manifests, selected) {
  if (!/^[a-z][a-z0-9-]*\/[a-zA-Z0-9_/-]+\.mjs$/.test(selector) || selector.includes('..')) {
    throw new Error('Setup steps must be owner-qualified, for example crm/backfill-owners.mjs')
  }

  const separator = selector.indexOf('/')
  const owner = manifests.find((manifest) => manifest.id === selector.slice(0, separator))

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
