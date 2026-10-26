import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { readPieces, repository } from '../infra/pieces.mjs'
import { pieceSchema } from './piece-schema.mjs'

function contains(parent, child) {
  return child === parent || child.startsWith(`${parent}/`)
}

function safePath(root, path) {
  let prefix = ''

  for (const part of path.split('/')) {
    prefix += `${part}/`
    const url = new URL(prefix.slice(0, -1), root)

    if (lstatSync(url).isSymbolicLink())
      throw new Error(`${path}: symlinks cannot be owned or traversed`)
  }
}

export function checkPieces(root = repository) {
  const pieces = readPieces(root).map((piece) => pieceSchema.parse(piece))
  const ids = pieces.map((piece) => piece.id)

  if (new Set(ids).size !== ids.length) throw new Error('Piece ids must be unique')

  if (!ids.includes('core')) throw new Error('core/piece.json is required')

  const owners = pieces.flatMap((piece) =>
    piece.ownedPaths.map((path) => ({ piece: piece.id, path })),
  )

  for (const [index, owner] of owners.entries()) {
    safePath(root, owner.path)

    for (const other of owners.slice(index + 1)) {
      if (contains(owner.path, other.path) || contains(other.path, owner.path)) {
        throw new Error(
          `Overlapping ownership: ${owner.piece}:${owner.path} and ${other.piece}:${other.path}`,
        )
      }
    }
  }

  for (const piece of pieces) {
    const manifest =
      piece.kind === 'core'
        ? 'core/piece.json'
        : `${piece.kind === 'module' ? 'modules' : 'connectors'}/${piece.id}/piece.json`

    const references = [manifest]

    if (piece.kind !== 'core') {
      const scripts = [...piece.setup.beforeSchema, ...piece.setup.afterSchema].map(
        (step) => step.script,
      )

      if (new Set(scripts).size !== scripts.length)
        throw new Error(`${piece.id}: setup scripts must be unique within the piece`)

      if (piece.kind === 'connector') {
        const targets = (piece.frontend ?? []).map((feature) => feature.path)

        if (new Set(targets).size !== targets.length)
          throw new Error(`${piece.id}: frontend paths must be unique`)

        for (const feature of piece.frontend ?? []) {
          if (feature.path !== `connectors/${piece.id}/frontend/${feature.module}`)
            throw new Error(`${piece.id}: frontend path must match its target module`)
        }
      }
    }

    for (const dependency of piece.requires) {
      if (!ids.includes(dependency))
        throw new Error(`${piece.id}: required piece ${dependency} is absent`)

      if (dependency === piece.id) throw new Error(`${piece.id}: cannot require itself`)
    }

    if (piece.kind !== 'core') {
      references.push(...piece.schemaFiles)

      if (piece.compose) references.push(piece.compose)
      references.push(...Object.values(piece.composeProfiles ?? {}))
      const directory = piece.kind === 'module' ? piece.infra : `connectors/${piece.id}`
      references.push(
        ...[...piece.setup.beforeSchema, ...piece.setup.afterSchema].map(
          (step) => `${directory}/monospace/setup/${step.script}`,
        ),
      )

      if (piece.kind === 'module')
        references.push(piece.app, piece.infra, ...piece.settings, `${piece.app}/module.ts`)
      else {
        if (piece.extension) references.push(`${directory}/${piece.extension.directory}`)

        if (piece.migrate) references.push(`${directory}/${piece.migrate}`)

        if (piece.provision) references.push(`${directory}/${piece.provision}`)
        references.push(
          ...(piece.frontend ?? []).flatMap((feature) => [
            feature.path,
            `${feature.path}/feature.tsx`,
          ]),
        )
      }
    }

    for (const path of references) {
      if (!piece.ownedPaths.some((owned) => contains(owned, path)))
        throw new Error(`${piece.id}: referenced path is not owned: ${path}`)
      safePath(root, path)
    }
  }

  // Git excludes generated builds, dependencies, and local secrets, but includes new source files.
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'apps/web/src/routes',
      'infra/modules',
      'connectors',
    ],
    { cwd: fileURLToPath(root), encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)

  for (const path of files) {
    if (
      !['apps/web/src/routes/', 'infra/modules/', 'connectors/'].some((prefix) =>
        path.startsWith(prefix),
      ) ||
      !existsSync(new URL(path, root))
    )
      continue
    const matches = owners.filter((owner) => contains(owner.path, path))

    if (matches.length !== 1)
      throw new Error(`${path}: expected one owner, found ${matches.length}`)
  }

  return pieces
}

export function removePiece(id, { root = repository, dryRun = false } = {}) {
  const pieces = checkPieces(root)
  const piece = pieces.find((candidate) => candidate.id === id)

  if (!piece) throw new Error(`Unknown piece: ${id}`)

  if (piece.kind === 'core') throw new Error('Core is always installed and cannot be removed')
  const dependents = pieces.filter((candidate) => candidate.requires.includes(id))

  if (dependents.length)
    throw new Error(
      `${id} is required by ${dependents.map((candidate) => candidate.id).join(', ')}`,
    )

  for (const path of piece.ownedPaths) {
    console.log(`${dryRun ? 'Would remove' : 'Removing'} ${path}`)

    if (!dryRun) rmSync(new URL(path, root), { recursive: true })
  }

  console.log('Next commands:\n  pnpm compose:sync\n  pnpm generate:routes\n  pnpm generate')

  return piece.ownedPaths
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, id, ...flags] = process.argv.slice(2)

    if (command === 'check' && !id)
      console.log(
        `Pieces: ${checkPieces()
          .map((piece) => piece.id)
          .join(', ')}`,
      )
    else if (command === 'remove' && id && flags.every((flag) => flag === '--dry-run'))
      removePiece(id, { dryRun: flags.includes('--dry-run') })
    else throw new Error('Usage: pnpm pieces:check | pnpm pieces:remove <id> [--dry-run]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
