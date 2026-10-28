import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { manifestPath, readManifests, repository } from '../infra/manifests.mjs'
import { ownershipSchema } from './manifest-schema.mjs'

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

function validateManifests(root = repository) {
  const manifests = readManifests(root)
  const ids = manifests.map((manifest) => manifest.id)

  if (new Set(ids).size !== ids.length) throw new Error('Manifest ids must be unique')

  if (!ids.includes('starter')) throw new Error('starter.json is required')

  const owners = manifests.flatMap((manifest) =>
    manifest.ownedPaths.map((path) => ({ manifest: manifest.id, path })),
  )

  for (const [index, owner] of owners.entries()) {
    safePath(root, owner.path)

    for (const other of owners.slice(index + 1)) {
      if (contains(owner.path, other.path) || contains(other.path, owner.path)) {
        throw new Error(
          `Overlapping ownership: ${owner.manifest}:${owner.path} and ${other.manifest}:${other.path}`,
        )
      }
    }
  }

  const scripts = new Set()

  for (const manifest of manifests) {
    for (const entry of manifest.packageEntries ?? []) {
      if (!safePath(root, entry.path))
        throw new Error(`${manifest.id}: missing package ${entry.path}`)

      for (const name of entry.names) {
        const key = `${entry.path}:${entry.section}:${name}`

        if (scripts.has(key)) throw new Error(`Overlapping package entry ownership: ${key}`)
        scripts.add(key)
      }
    }

    const references = [
      ...(manifest.kind === 'deploy' && manifest.lint ? [manifest.lint] : []),
      manifestPath(manifest),
    ]

    if (manifest.kind === 'module' || manifest.kind === 'connector') {
      const scripts = [...manifest.setup.beforeSchema, ...manifest.setup.afterSchema].map(
        (step) => step.script,
      )

      if (new Set(scripts).size !== scripts.length)
        throw new Error(`${manifest.id}: setup scripts must be unique within the manifest`)

      const known = new Set([
        ...ids,
        ...manifest.requires,
        ...manifest.optional,
        ...Object.values(manifest.requiresWhenInstalled).flat(),
        ...(manifest.frontend ?? []).map((feature) => feature.module),
      ])

      for (const step of [...manifest.setup.beforeSchema, ...manifest.setup.afterSchema]) {
        for (const required of step.requires ?? []) {
          if (!known.has(required))
            throw new Error(
              `${manifest.id}: setup step ${step.script} names unknown requirement ${required}`,
            )
        }
      }

      if (manifest.kind === 'connector') {
        const targets = (manifest.frontend ?? []).map((feature) => feature.path)

        if (new Set(targets).size !== targets.length)
          throw new Error(`${manifest.id}: frontend paths must be unique`)

        for (const feature of manifest.frontend ?? []) {
          if (feature.path !== `connectors/${manifest.id}/frontend/${feature.module}`)
            throw new Error(`${manifest.id}: frontend path must match its target module`)
        }
      }
    }

    for (const dependency of manifest.requires) {
      if (!ids.includes(dependency))
        throw new Error(`${manifest.id}: required manifest ${dependency} is absent`)

      if (dependency === manifest.id) throw new Error(`${manifest.id}: cannot require itself`)
    }

    if (manifest.kind === 'module' || manifest.kind === 'connector') {
      references.push(...manifest.schemaFiles)

      if (manifest.compose) references.push(manifest.compose)
      references.push(...Object.values(manifest.composeProfiles ?? {}))
      const directory = manifest.kind === 'module' ? manifest.infra : `connectors/${manifest.id}`
      references.push(
        ...[...manifest.setup.beforeSchema, ...manifest.setup.afterSchema].map(
          (step) => `${directory}/monospace/setup/${step.script}`,
        ),
      )

      if (manifest.kind === 'module')
        references.push(
          manifest.app,
          manifest.infra,
          ...manifest.settings,
          `${manifest.app}/module.ts`,
        )
      else {
        if (manifest.extension) references.push(`${directory}/${manifest.extension.directory}`)

        if (manifest.migrate) references.push(`${directory}/${manifest.migrate}`)

        if (manifest.provision) references.push(`${directory}/${manifest.provision}`)
        references.push(
          ...(manifest.frontend ?? []).flatMap((feature) => [
            feature.path,
            `${feature.path}/feature.tsx`,
          ]),
        )
      }
    }

    for (const path of references) {
      if (!manifest.ownedPaths.some((owned) => contains(owned, path)))
        throw new Error(`${manifest.id}: referenced path is not owned: ${path}`)

      if (!safePath(root, path)) throw new Error(`${manifest.id}: ${path} is listed but missing`)
    }
  }

  return { manifests, owners }
}

const ownedTrees = [
  'apps/web/src/routes',
  'apps/web/src/modules',
  'infra/modules',
  'connectors',
  'deploy',
]

function sourceFiles(root) {
  const cwd = fileURLToPath(root)

  const git = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (git.status === 0 && git.stdout.trim() === 'true') {
    return execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...ownedTrees],
      { cwd, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean)
  }

  const ignored = new Set(['node_modules', 'dist', '.output', '.git', '.pnpm-store', '.cache'])

  function walk(path) {
    if (!existsSync(new URL(path, root))) return []

    return readdirSync(new URL(`${path}/`, root), { withFileTypes: true }).flatMap((entry) => {
      if (ignored.has(entry.name)) return []
      const child = `${path}/${entry.name}`

      return entry.isDirectory() ? walk(child) : [child]
    })
  }

  return ownedTrees.flatMap(walk)
}

export function checkApp(root = repository) {
  const { manifests, owners } = validateManifests(root)
  const files = sourceFiles(root)

  for (const path of files) {
    if (!ownedTrees.some((tree) => path.startsWith(`${tree}/`)) || !existsSync(new URL(path, root)))
      continue
    const matches = owners.filter((owner) => contains(owner.path, path))

    if (matches.length !== 1)
      throw new Error(`${path}: expected one owner, found ${matches.length}`)
  }

  return manifests
}

export function removeInstalled(id, { root = repository, dryRun = false } = {}) {
  const { manifests } = validateManifests(root)
  const manifest = manifests.find((candidate) => candidate.id === id)

  if (!manifest) throw new Error(`Unknown module, connector, or deploy target: ${id}`)

  if (manifest.kind === 'starter')
    throw new Error('Starter is always installed and cannot be removed')
  const dependents = manifests.filter((candidate) => candidate.requires.includes(id))

  if (dependents.length)
    throw new Error(
      `${id} is required by ${dependents.map((candidate) => candidate.id).join(', ')}`,
    )

  removeOwned(manifest, { root, dryRun })

  const starter = manifests.find((manifest) => manifest.kind === 'starter')
  console.log('For a connected source, remove its relations and source in Studio first.')
  console.log('Update README.md, AGENTS.md, and docs/ for the removed feature.')
  console.log('Next commands:')

  for (const step of starter.nextSteps.remove)
    console.log(`  ${step.script ? `pnpm ${step.script}` : step.command.join(' ')}`)

  return manifest.ownedPaths
}

export function removeOwned(input, { root = repository, dryRun = false } = {}) {
  const manifest = ownershipSchema.parse(input)

  for (const path of manifest.ownedPaths) safePath(root, path)

  for (const entry of manifest.packageEntries ?? []) {
    if (!safePath(root, entry.path))
      throw new Error(`${manifest.id}: missing package ${entry.path}`)
  }

  for (const entry of manifest.packageEntries ?? []) {
    const path = new URL(entry.path, root)
    const yaml = entry.path.endsWith('.yaml')
    const content = readFileSync(path, 'utf8')
    const document = yaml ? createRequire(import.meta.url)('yaml').parseDocument(content) : null
    const manifest = document ? document.toJS() : JSON.parse(content)

    for (const name of entry.names) {
      console.log(`${dryRun ? 'Would remove' : 'Removing'} ${entry.path} ${entry.section}.${name}`)
      const section = manifest[entry.section]

      if (document) document.deleteIn([entry.section, name])
      else if (section) delete section[name]
    }

    if (!dryRun)
      writeFileSync(path, document ? document.toString() : `${JSON.stringify(manifest, null, 2)}\n`)
  }

  for (const path of manifest.ownedPaths) {
    if (!existsSync(new URL(path, root))) continue
    console.log(`${dryRun ? 'Would remove' : 'Removing'} ${path}`)

    if (!dryRun) rmSync(new URL(path, root), { recursive: true })
  }

  return manifest.ownedPaths
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, id, ...flags] = process.argv.slice(2)

    if (command === 'check' && !id)
      console.log(
        `Installed: ${checkApp()
          .map((manifest) => manifest.id)
          .join(', ')}`,
      )
    else if (command === 'remove' && id && flags.every((flag) => flag === '--dry-run'))
      removeInstalled(id, { dryRun: flags.includes('--dry-run') })
    else throw new Error('Usage: pnpm app:doctor | pnpm app:remove <id> [--dry-run]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
