import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { partFolders, partKinds, readManifest, repository } from '../infra/manifests.mjs'

function contains(parent, child) {
  return child === parent || child.startsWith(`${parent}/`)
}

function safePath(root, path) {
  let prefix = ''

  for (const part of path.split('/')) {
    prefix += `${part}/`
    const url = new URL(prefix.slice(0, -1), root)

    const stat = lstatSync(url, { throwIfNoEntry: false })

    if (!stat) return false

    if (stat.isSymbolicLink()) throw new Error(`${path}: symlinks cannot be owned or traversed`)
  }

  return true
}

function parsePackage(file, content) {
  if (!/\.ya?ml$/.test(file)) return { document: null, value: JSON.parse(content) }

  const document = createRequire(import.meta.url)('yaml').parseDocument(content)

  return { document, value: document.toJS() }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function folders(root, path) {
  const url = new URL(`${path}/`, root)

  return existsSync(url)
    ? readdirSync(url, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.'),
        )
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
    : []
}

// A feature is on when its target module and every connector it needs are installed.
function featureStatus(feature, ids) {
  const missing = [feature.module, ...feature.requires].filter((id) => !ids.includes(id))

  return missing.length ? `off: needs ${missing.join(', ')}` : 'on'
}

function describe(root, manifest, ids) {
  if (manifest.kind === 'starter') return 'starter: owns every path outside the parts'

  const details = []

  if (manifest.kind === 'module') {
    const routes = folders(root, `${manifest.folder}/routes`)
    details.push(routes.length ? `routes ${routes.join('+')}` : 'no routes')
  }

  if (manifest.compose)
    details.push(
      `compose${Object.keys(manifest.composeProfiles).length ? ` (+${Object.keys(manifest.composeProfiles).join(', ')})` : ''}`,
    )

  if (manifest.extension) details.push(`extension ${manifest.extension.installed}`)

  if (manifest.kind === 'module' || manifest.kind === 'connector') {
    details.push(plural(manifest.schemaFiles.length, 'schema file'))
    details.push(
      plural(manifest.setup.beforeSchema.length + manifest.setup.afterSchema.length, 'setup step'),
    )
  }

  if (manifest.migrate) details.push('migrate')

  if (manifest.provision) details.push('provision')

  for (const feature of manifest.frontend ?? [])
    details.push(`${feature.module} feature ${featureStatus(feature, ids)}`)

  if (manifest.lint) details.push('lint')

  if (manifest.alsoOwns.length) details.push(`also owns ${manifest.alsoOwns.join(', ')}`)

  const entries = manifest.packageEntries.flatMap((entry) =>
    Object.keys(entry.entries).map((name) => `${entry.section}.${name}`),
  )

  if (entries.length) details.push(`package entries ${entries.join(', ')}`)

  return `${manifest.id} (${manifest.kind}): ${details.join(', ')}`
}

function validateManifests(root = repository) {
  if (!existsSync(new URL('starter.json', root))) throw new Error('starter.json is required')

  const parts = partFolders(root)

  for (const part of parts) {
    safePath(root, part.folder)

    if (!existsSync(new URL(part.file, root)))
      throw new Error(`${part.folder}: every folder here is a ${part.kind}; add ${part.file}`)
  }

  const manifests = [
    readManifest(root, { kind: 'starter', id: 'starter', folder: '', file: 'starter.json' }),
    ...parts.map((part) => readManifest(root, part)),
  ]

  const ids = manifests.map((manifest) => manifest.id)

  for (const [index, id] of ids.entries()) {
    if (ids.indexOf(id) !== index) throw new Error(`Part ids must be unique across kinds: ${id}`)
  }

  // Parts own their folder; alsoOwns are root-only extras that cannot touch any part folder.
  const owned = manifests.flatMap((manifest) =>
    manifest.alsoOwns.map((path) => ({ id: manifest.id, path })),
  )

  const reserved = ['starter.json', ...partKinds.map(([base]) => base)]

  for (const [index, owner] of owned.entries()) {
    for (const other of [
      ...reserved.map((path) => ({ id: 'starter', path })),
      ...owned.slice(index + 1),
    ]) {
      if (contains(owner.path, other.path) || contains(other.path, owner.path))
        throw new Error(
          `Overlapping ownership: ${owner.id}:${owner.path} and ${other.id}:${other.path}`,
        )
    }

    if (!safePath(root, owner.path))
      throw new Error(`${owner.id}: alsoOwns ${owner.path} is missing`)
  }

  const packageKeys = new Set()

  for (const manifest of manifests) {
    for (const entry of manifest.packageEntries) {
      if (!safePath(root, entry.file))
        throw new Error(`${manifest.id}: missing package file ${entry.file}`)

      const { value } = parsePackage(entry.file, readFileSync(new URL(entry.file, root), 'utf8'))

      for (const [name, expected] of Object.entries(entry.entries)) {
        const key = `${entry.file}:${entry.section}:${name}`

        if (packageKeys.has(key)) throw new Error(`Overlapping package entry ownership: ${key}`)
        packageKeys.add(key)

        if (value[entry.section]?.[name] !== expected)
          throw new Error(
            `${manifest.id}: ${entry.file} ${entry.section}.${name} must be ${JSON.stringify(expected)}`,
          )
      }
    }

    for (const dependency of manifest.requires) {
      if (dependency === manifest.id) throw new Error(`${manifest.id}: cannot require itself`)

      if (!ids.includes(dependency))
        throw new Error(`${manifest.id}: required part ${dependency} has no folder`)
    }

    if (manifest.kind === 'module' && !existsSync(new URL(`${manifest.app}/module.ts`, root)))
      throw new Error(`${manifest.id}: ${manifest.app}/module.ts is missing`)

    if (manifest.kind !== 'module' && manifest.kind !== 'connector') continue

    const steps = [...manifest.setup.beforeSchema, ...manifest.setup.afterSchema]
    const scripts = steps.map((step) => step.script)

    if (new Set(scripts).size !== scripts.length)
      throw new Error(`${manifest.id}: setup scripts must be unique within the manifest`)

    const known = new Set([
      ...ids,
      ...Object.keys(manifest.contributes ?? {}),
      ...Object.values(manifest.contributes ?? {}).flatMap((feature) => feature.requires),
    ])

    for (const step of steps) {
      const script = `${manifest.setupDirectory}/${step.script}`

      if (!safePath(root, script))
        throw new Error(`${manifest.id}: setup script ${script} is missing`)

      for (const required of step.requires ?? []) {
        if (!known.has(required))
          throw new Error(
            `${manifest.id}: setup step ${step.script} names unknown requirement ${required}`,
          )
      }
    }

    if (manifest.kind !== 'connector') continue

    if (existsSync(new URL(`${manifest.folder}/extension/`, root)) && !manifest.extension)
      throw new Error(`${manifest.id}: extension/ needs extension.config.json`)

    for (const feature of manifest.frontend) {
      if (!safePath(root, `${feature.path}/feature.tsx`))
        throw new Error(
          `${manifest.id}: contributes.${feature.module} needs ${feature.path}/feature.tsx`,
        )
    }

    for (const module of folders(root, `${manifest.folder}/frontend`)) {
      if (!Object.hasOwn(manifest.contributes, module))
        throw new Error(
          `${manifest.id}: ${manifest.folder}/frontend/${module} needs an x-monoerp.contributes.${module} entry`,
        )
    }
  }

  const visiting = new Set()
  const visited = new Set()

  function visit(manifest) {
    if (visited.has(manifest.id)) return

    if (visiting.has(manifest.id)) throw new Error(`Circular requirements through ${manifest.id}`)
    visiting.add(manifest.id)

    for (const dependency of manifest.requires)
      visit(manifests.find((candidate) => candidate.id === dependency))
    visiting.delete(manifest.id)
    visited.add(manifest.id)
  }

  for (const manifest of manifests) visit(manifest)

  return manifests
}

export function checkApp(root = repository) {
  const manifests = validateManifests(root)
  const ids = manifests.map((manifest) => manifest.id)

  return { manifests, report: manifests.map((manifest) => describe(root, manifest, ids)) }
}

export function removeInstalled(id, { root = repository, dryRun = false } = {}) {
  const manifests = validateManifests(root)
  const manifest = manifests.find((candidate) => candidate.id === id)

  if (!manifest) throw new Error(`Unknown module, connector, or deploy target: ${id}`)

  if (manifest.kind === 'starter')
    throw new Error('Starter is always installed and cannot be removed')

  const dependents = manifests.filter((candidate) => candidate.requires.includes(id))

  if (dependents.length)
    throw new Error(
      `${id} is required by ${dependents.map((candidate) => candidate.id).join(', ')}`,
    )

  const edits = new Map()

  for (const entry of manifest.packageEntries) {
    const previous =
      edits.get(entry.file)?.previous ?? readFileSync(new URL(entry.file, root), 'utf8')

    const { document, value } = parsePackage(entry.file, edits.get(entry.file)?.content ?? previous)

    for (const name of Object.keys(entry.entries)) {
      console.log(`${dryRun ? 'Would remove' : 'Removing'} ${entry.file} ${entry.section}.${name}`)

      if (document) document.deleteIn([entry.section, name])
      else if (value[entry.section]) delete value[entry.section][name]
    }

    edits.set(entry.file, {
      previous,
      content: document ? document.toString() : encodePackage(value, previous),
    })
  }

  if (!dryRun) {
    for (const [path, edit] of edits) {
      if (readFileSync(new URL(path, root), 'utf8') !== edit.previous)
        throw new Error(`${path} changed during removal; run the command again`)
      writeFileSync(new URL(path, root), edit.content)
    }
  }

  for (const path of manifest.ownedPaths) {
    if (!existsSync(new URL(path, root))) continue
    console.log(`${dryRun ? 'Would remove' : 'Removing'} ${path}`)

    if (!dryRun) rmSync(new URL(path, root), { recursive: true })
  }

  const remaining = manifests.map((candidate) => candidate.id).filter((other) => other !== id)

  for (const connector of manifests) {
    for (const feature of connector.frontend ?? []) {
      if (
        connector.id !== id &&
        feature.requires.includes(id) &&
        remaining.includes(feature.module)
      )
        console.log(
          `${connector.id}: ${feature.module} feature turns ${featureStatus(feature, remaining)}`,
        )
    }
  }

  console.log('For a connected source, remove its relations and source in Studio first.')
  console.log('Update README.md, AGENTS.md, and docs/ for the removed feature.')
  console.log('Next commands:')

  for (const step of manifests[0].nextSteps.remove)
    console.log(`  ${step.script ? `pnpm ${step.script}` : step.command.join(' ')}`)

  return manifest.ownedPaths
}

function encodePackage(value, previous) {
  const indent = /\n([\t ]+)"/.exec(previous)?.[1]
  const newline = previous.includes('\r\n') ? '\r\n' : '\n'
  const suffix = previous.endsWith('\n') ? newline : ''

  return JSON.stringify(value, null, indent).replaceAll('\n', newline) + suffix
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, id, ...flags] = process.argv.slice(2)

    if (command === 'check' && !id) {
      const { manifests, report } = checkApp()
      console.log(`Installed: ${manifests.map((manifest) => manifest.id).join(', ')}`)

      for (const line of report) console.log(`  ${line}`)
    } else if (command === 'remove' && id && flags.every((flag) => flag === '--dry-run'))
      removeInstalled(id, { dryRun: flags.includes('--dry-run') })
    else throw new Error('Usage: pnpm app:doctor | pnpm app:remove <id> [--dry-run]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
