import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'

import { syncCompose } from './compose-sync.mjs'
import { requestedConnectors } from './pieces.mjs'

const directories = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

it('uses manifest compose paths and overlays, dropping removed pieces', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monoerp-pieces-'))
  directories.push(directory)
  const root = pathToFileURL(`${directory}/`)

  for (const [kind, base, id, compose] of [
    ['connector', 'connectors', 'stripe', 'connectors/stripe/local.yml'],
    ['module', 'modules', 'inventory', 'infra/modules/inventory/compose.yml'],
  ]) {
    const folder = new URL(`${base}/${id}/`, root)
    await mkdir(folder, { recursive: true })
    await writeFile(
      new URL('piece.json', folder),
      JSON.stringify({ kind, id, compose, composeProfiles: { bench: `${base}/${id}/bench.yml` } }),
    )
  }

  expect(await syncCompose(root)).toEqual([
    'infra/modules/inventory/compose.yml',
    'connectors/stripe/local.yml',
  ])
  await syncCompose(root, 'bench')
  expect(await readFile(new URL('compose.pieces.yml', root), 'utf8')).toContain(
    'connectors/stripe/bench.yml',
  )

  await rm(new URL('connectors/stripe/', root), { recursive: true })
  expect(await syncCompose(root)).toEqual(['infra/modules/inventory/compose.yml'])
  expect(await readFile(new URL('compose.pieces.yml', root), 'utf8')).not.toContain('stripe')

  await rm(new URL('modules/inventory/', root), { recursive: true })
  expect(await syncCompose(root)).toEqual([])
  expect(await readFile(new URL('compose.pieces.yml', root), 'utf8')).toContain('include: []')
})

it('uses required and optional module connectors unless OPTIONAL_SOURCES overrides them', () => {
  const modules = [
    { requires: ['portal'], optional: ['stripe'] },
    { requires: ['demo'], optional: ['stripe'] },
  ]

  expect([...requestedConnectors(modules)]).toEqual(['portal', 'stripe', 'demo'])
  expect([...requestedConnectors([{ requires: ['demo'], optional: [] }])]).toEqual(['demo'])
  expect([...requestedConnectors([], 'stripe, portal, stripe')]).toEqual(['stripe', 'portal'])
  expect([...requestedConnectors(modules, '')]).toEqual([])
})

it('selects only installed connectors, preserving unset and empty overrides', async () => {
  const { selectConnectors } = await import('./pieces.mjs')

  const pieces = [
    { kind: 'module', id: 'sales', requires: ['portal'], optional: ['stripe', 'absent'] },
    ...['portal', 'stripe', 'demo'].map((id) => ({ kind: 'connector', id })),
  ]

  expect(selectConnectors(pieces).map((piece) => piece.id)).toEqual(['portal', 'stripe'])
  expect(selectConnectors(pieces, '').map((piece) => piece.id)).toEqual([])
  expect(selectConnectors(pieces, 'demo,absent').map((piece) => piece.id)).toEqual(['demo'])
})
