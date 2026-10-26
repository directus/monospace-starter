import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  readFrontendFeatures,
  readModuleCollections,
  readOrganizationPanelPaths,
} from './module-collections'

const temporaryDirectories: URL[] = []

function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'monoerp-modules-'))
  temporaryDirectories.push(pathToFileURL(`${path}/`))

  return pathToFileURL(`${path}/`)
}

function addModule(root: URL, id: string, order: number, collections: string[], schemas: string[]) {
  const directory = new URL(`modules/${id}/`, root)
  const app = `apps/web/src/modules/${id}`
  mkdirSync(directory, { recursive: true })
  mkdirSync(new URL(`${app}/`, root), { recursive: true })
  writeFileSync(
    new URL('module.json', directory),
    JSON.stringify({
      kind: 'module',
      id,
      app,
      order,
      collections,
      schemas,
      requires: [],
      optional: [],
    }),
  )
}

function addConnector(root: URL, id: string) {
  const directory = new URL(`connectors/${id}/`, root)
  mkdirSync(directory, { recursive: true })
  writeFileSync(new URL('connector.json', directory), JSON.stringify({ kind: 'connector', id }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()

  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true })
})

describe('module collection discovery', () => {
  it('drops a removed module and restores its collections when copied back', () => {
    const root = fixture()
    addModule(root, 'inventory', 20, ['products', 'stockLevels'], ['products'])
    addModule(root, 'sales', 10, ['organizations', 'billingCustomers'], ['organizations'])

    expect(readModuleCollections(root)).toEqual({
      appCollections: ['organizations', 'billingCustomers', 'products', 'stockLevels'],
      schemaCollections: ['organizations', 'products'],
    })

    rmSync(new URL('modules/inventory/', root), { recursive: true })
    expect(readModuleCollections(root)).toEqual({
      appCollections: ['organizations', 'billingCustomers'],
      schemaCollections: ['organizations'],
    })

    addModule(root, 'inventory', 20, ['products', 'stockLevels'], ['products'])
    expect(readModuleCollections(root).appCollections).toContain('stockLevels')

    rmSync(new URL('modules/inventory/', root), { recursive: true })
    rmSync(new URL('modules/sales/', root), { recursive: true })
    expect(readModuleCollections(root)).toEqual({ appCollections: [], schemaCollections: [] })
  })

  it('rejects a write schema whose collection is absent from the SDK', () => {
    const root = fixture()
    addModule(root, 'sales', 10, ['organizations'], ['missing'])
    expect(() => readModuleCollections(root)).toThrow('schemas missing from collections: missing')
  })

  it('adds only selected features for an installed module and its required sources', () => {
    const root = fixture()
    addModule(root, 'crm', 10, ['organizations', 'accounts'], ['organizations'])
    addConnector(root, 'portal')
    addConnector(root, 'stripe')
    writeFileSync(
      new URL('connectors/stripe/connector.json', root),
      JSON.stringify({
        kind: 'connector',
        id: 'stripe',
        frontend: [
          {
            module: 'crm',
            slot: 'organization-panel',
            path: 'connectors/stripe/frontend/crm',
            requires: ['portal'],
            order: 10,
            collections: ['stripeCustomers', 'stripeCharges'],
            schemas: [],
          },
        ],
      }),
    )

    const entry = new URL('connectors/stripe/frontend/crm/feature.tsx', root)
    mkdirSync(new URL('./', entry), { recursive: true })
    writeFileSync(entry, '')

    expect(readModuleCollections(root, ['portal', 'stripe'])).toEqual({
      appCollections: ['organizations', 'accounts', 'stripeCustomers', 'stripeCharges'],
      schemaCollections: ['organizations'],
    })
    expect(readFrontendFeatures(root, ['portal', 'stripe']).active).toHaveLength(1)
    expect(readFrontendFeatures(root, ['portal']).active).toEqual([])
    expect(readFrontendFeatures(root, ['stripe']).active).toEqual([])

    rmSync(new URL('connectors/portal/', root), { recursive: true })
    expect(readFrontendFeatures(root, ['portal', 'stripe']).active).toEqual([])
    addConnector(root, 'portal')

    rmSync(new URL('modules/crm/', root), { recursive: true })
    expect(readModuleCollections(root, ['portal', 'stripe']).appCollections).toEqual([])
    addModule(root, 'crm', 10, ['organizations', 'accounts'], ['organizations'])

    const active = readFrontendFeatures(root, ['portal', 'stripe']).active
    expect(
      readOrganizationPanelPaths([
        ...active,
        ...active.map((feature) => ({ ...feature, module: 'inventory' })),
        ...active.map((feature) => ({ ...feature, slot: 'another-slot' })),
      ]),
    ).toEqual(['connectors/stripe/frontend/crm'])
    rmSync(entry)
    expect(() => readFrontendFeatures(root, ['portal', 'stripe'])).toThrow(
      'Selected frontend entry is missing',
    )
    expect(readFrontendFeatures(root, ['portal']).active).toEqual([])

    rmSync(new URL('connectors/stripe/', root), { recursive: true })
    expect(readModuleCollections(root, ['portal', 'stripe']).appCollections).toEqual([
      'organizations',
      'accounts',
    ])
  })
})

it('keeps an installed inventory-targeted feature out of the CRM organization slot', () => {
  const root = fixture()
  addModule(root, 'crm', 10, ['organizations'], [])
  addModule(root, 'inventory', 20, ['products'], [])

  for (const [connector, module] of [
    ['stripe', 'crm'],
    ['demo', 'inventory'],
  ]) {
    addConnector(root, connector)
    const path = `connectors/${connector}/frontend/${module}`

    const feature = {
      module,
      slot: 'organization-panel',
      path,
      requires: [],
      order: 10,
      collections: [`${connector}Records`],
      schemas: [],
    }

    writeFileSync(
      new URL(`connectors/${connector}/connector.json`, root),
      JSON.stringify({ kind: 'connector', id: connector, frontend: [feature] }),
    )
    mkdirSync(new URL(`${path}/`, root), { recursive: true })
    writeFileSync(new URL(`${path}/feature.tsx`, root), '')
  }

  const features = readFrontendFeatures(root, ['stripe', 'demo'])
  expect(features.active).toHaveLength(2)
  expect(readOrganizationPanelPaths(features.active)).toEqual(['connectors/stripe/frontend/crm'])
})

it('drops Portal and conditional Stripe collections when Portal is removed', () => {
  const root = fixture()
  addModule(root, 'crm', 10, ['organizations', 'contacts'], ['organizations'])

  for (const connector of ['portal', 'stripe']) {
    addConnector(root, connector)
    const path = `connectors/${connector}/frontend/crm`
    mkdirSync(new URL(`${path}/`, root), { recursive: true })
    writeFileSync(new URL(`${path}/feature.tsx`, root), '')
    writeFileSync(
      new URL(`connectors/${connector}/connector.json`, root),
      JSON.stringify({
        kind: 'connector',
        id: connector,
        frontend: [
          {
            module: 'crm',
            slot: 'organization-panel',
            path,
            requires: connector === 'stripe' ? ['portal'] : [],
            order: 10,
            collections: connector === 'portal' ? ['accounts', 'users'] : ['stripeCustomers'],
            schemas: [],
          },
        ],
      }),
    )
  }

  expect(readModuleCollections(root, ['portal', 'stripe']).appCollections).toEqual([
    'organizations',
    'contacts',
    'accounts',
    'users',
    'stripeCustomers',
  ])
  rmSync(new URL('connectors/portal/', root), { recursive: true })
  expect(readModuleCollections(root, ['portal', 'stripe']).appCollections).toEqual([
    'organizations',
    'contacts',
  ])
  expect(readFrontendFeatures(root, ['portal', 'stripe']).active).toEqual([])
})

it('explains when connector selection disables a frontend feature', () => {
  const root = fixture()
  addModule(root, 'crm', 10, ['organizations'], [])
  addConnector(root, 'portal')
  writeFileSync(
    new URL('connectors/portal/connector.json', root),
    JSON.stringify({
      kind: 'connector',
      id: 'portal',
      frontend: [
        {
          module: 'crm',
          slot: 'organization-panel',
          path: 'connectors/portal/frontend/crm',
          requires: [],
          order: 10,
          collections: ['accounts'],
          schemas: [],
        },
      ],
    }),
  )
  vi.stubEnv('OPTIONAL_SOURCES', undefined)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  expect(readFrontendFeatures(root, []).active).toEqual([])
  expect(log).not.toHaveBeenCalled()
  vi.stubEnv('OPTIONAL_SOURCES', '')
  expect(readFrontendFeatures(root, []).active).toEqual([])
  expect(log).toHaveBeenCalledWith('portal: skipped, disabled in OPTIONAL_SOURCES')
})
