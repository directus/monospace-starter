import assert from 'node:assert/strict'
import { it } from 'node:test'

import { combinations, portNames } from './combo.mjs'

function fixture() {
  return [
    { kind: 'starter', id: 'starter', requires: [], optional: [] },
    { kind: 'connector', id: 'billing', requires: [], optional: [] },
    { kind: 'connector', id: 'portal', requires: [], optional: [] },
    { kind: 'connector', id: 'checks', requires: [], optional: [] },
    { kind: 'module', id: 'sales', requires: ['portal'], optional: ['billing'] },
    { kind: 'module', id: 'hiring', requires: ['checks'], optional: [] },
  ]
}

it('derives module selections and removes dependents before their required connectors', () => {
  const manifests = fixture()
  const combos = combinations(manifests)
  assert.deepEqual(
    combos.map((combo) => combo.name),
    ['everything', 'starter-only', 'sales-only', 'sales-without-billing', 'hiring-only'],
  )
  assert.deepEqual(combos[0].remove, [])
  assert.deepEqual(combos.find((combo) => combo.name === 'sales-only').remove, ['hiring', 'checks'])
  assert.deepEqual(combos.find((combo) => combo.name === 'sales-without-billing').remove, [
    'billing',
    'hiring',
    'checks',
  ])
  assert.deepEqual(combos.find((combo) => combo.name === 'hiring-only').remove, [
    'billing',
    'sales',
    'portal',
  ])

  for (const combo of combos) {
    const installed = new Map(manifests.map((manifest) => [manifest.id, manifest]))

    for (const id of combo.remove) {
      assert.equal(
        [...installed.values()].some((manifest) => manifest.requires.includes(id)),
        false,
      )
      installed.delete(id)
    }

    assert.equal(installed.has('starter'), true)
  }
})

it('drops absent modules and optional connectors from the public repo matrix', () => {
  const manifests = fixture().filter(
    (manifest) => !['hiring', 'checks', 'billing'].includes(manifest.id),
  )

  assert.deepEqual(combinations(manifests), [
    { name: 'everything', remove: [] },
    { name: 'starter-only', remove: ['sales', 'portal'] },
  ])
})

it('keeps transitive dependencies and refuses optional variations required elsewhere', () => {
  const manifests = fixture()
  manifests.find((manifest) => manifest.id === 'portal').requires.push('billing')
  const combos = combinations(manifests)
  assert.equal(
    combos.some((combo) => combo.name === 'sales-without-billing'),
    false,
  )
  assert.deepEqual(combos.find((combo) => combo.name === 'sales-only').remove, ['hiring', 'checks'])
  assert.deepEqual(combos.find((combo) => combo.name === 'hiring-only').remove, [
    'sales',
    'portal',
    'billing',
  ])
})

it('rejects cycles in the removal graph before any removal runs', () => {
  const manifests = fixture()
  manifests.find((manifest) => manifest.id === 'checks').requires.push('hiring')
  assert.throws(() => combinations(manifests), { message: 'Circular required dependencies' })
})

it('derives all-optional removal and keeps each source selection only once', () => {
  const manifests = fixture()
  const module = manifests.find((manifest) => manifest.id === 'sales')
  module.id = 'crm'
  manifests.find((manifest) => manifest.id === 'billing').id = 'stripe'
  module.requires = []
  module.optional = ['portal', 'stripe']
  const combos = combinations(manifests)
  assert.deepEqual(combos.find((combo) => combo.name === 'crm-without-portal-stripe').remove, [
    'stripe',
    'portal',
    'hiring',
    'checks',
  ])
  assert.ok(combos.find((combo) => combo.name === 'starter-only').remove.includes('crm'))

  const keys = combos.map((combo) =>
    [...combo.remove].sort((left, right) => left.localeCompare(right)).join(','),
  )

  assert.equal(new Set(keys).size, keys.length)

  const publicManifests = manifests.filter(
    (manifest) => !['hiring', 'checks'].includes(manifest.id),
  )

  assert.ok(
    !combinations(publicManifests)
      .map((combo) => combo.name)
      .includes('crm-only'),
  )
})

it('isolates optional-service ports even when absent from the environment example', () => {
  assert.deepEqual(
    portNames('ports: ["${CHECKR_PORT:-4020}:4020", "${APP_PORT}:80", "${CHECKR_PORT}:4020"]'),
    ['CHECKR_PORT', 'APP_PORT'],
  )
})

it('includes deploy targets in everything and removes them for a bare starter', () => {
  const manifests = [...fixture(), { kind: 'deploy', id: 'aws', requires: [] }]
  const combos = combinations(manifests)
  assert.deepEqual(combos.find(({ name }) => name === 'everything').remove, [])
  assert.ok(combos.find(({ name }) => name === 'starter-only').remove.includes('aws'))
})

it('orders active conditional dependents before requirements during combination removal', () => {
  const manifests = fixture()
  manifests.find(({ id }) => id === 'sales').requires = []

  const portal = manifests.splice(
    manifests.findIndex(({ id }) => id === 'portal'),
    1,
  )[0]

  manifests.unshift(portal)
  manifests.find(({ id }) => id === 'billing').requiresWhenInstalled = { hiring: ['portal'] }
  const selected = combinations(manifests).find(({ name }) => name === 'hiring-only')
  assert.ok(selected.remove.indexOf('billing') < selected.remove.indexOf('portal'))
})
