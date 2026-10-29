import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, expect, it } from 'vitest'

import { manifestDocument, manifestPath } from '../tools/manifest-fixtures.mjs'
import { syncCompose } from './compose-sync.mjs'
import { requestedConnectors, selectConnectors } from './manifests.mjs'

const directories = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

it('includes every compose.yml by convention, dropping removed parts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monoerp-manifests-'))
  directories.push(directory)
  const root = pathToFileURL(`${directory}/`)

  for (const [kind, id] of [
    ['connector', 'stripe'],
    ['module', 'inventory'],
  ]) {
    const folder = new URL(`${manifestPath({ kind, id })}/../`, root)
    await mkdir(folder, { recursive: true })
    await writeFile(new URL(`${kind}.json`, folder), JSON.stringify(manifestDocument({ kind, id })))
    await writeFile(new URL('compose.yml', folder), 'services: {}\n')
  }

  expect(await syncCompose(root)).toEqual([
    'modules/inventory/compose.yml',
    'connectors/stripe/compose.yml',
  ])
  await rm(new URL('connectors/stripe/', root), { recursive: true })
  expect(await syncCompose(root)).toEqual(['modules/inventory/compose.yml'])
  expect(await readFile(new URL('compose.app.yml', root), 'utf8')).not.toContain('stripe')

  await rm(new URL('modules/inventory/', root), { recursive: true })
  expect(await syncCompose(root)).toEqual([])
  expect(await readFile(new URL('compose.app.yml', root), 'utf8')).toContain('include: []')
})

it('selects installed connectors unless OPTIONAL_SOURCES names a different list', () => {
  const manifests = [
    { kind: 'module', id: 'sales', requires: ['demo'] },
    ...['portal', 'stripe'].map((id) => ({ kind: 'connector', id, requires: [] })),
  ]

  const ids = (selected) => selected.map((manifest) => manifest.id)

  expect([...requestedConnectors(manifests)]).toEqual(['demo', 'portal', 'stripe'])
  expect([...requestedConnectors([], 'stripe, portal, stripe')]).toEqual(['stripe', 'portal'])
  expect(ids(selectConnectors(manifests))).toEqual(['portal', 'stripe'])
  expect(ids(selectConnectors(manifests, ''))).toEqual([])
  expect(ids(selectConnectors(manifests, 'stripe,absent'))).toEqual(['stripe'])
})
