import { expect, it } from 'vitest'

import { combinations } from './combo.mjs'

function fixture() {
  return [
    { kind: 'core', id: 'core', requires: [], optional: [] },
    { kind: 'connector', id: 'billing', requires: [], optional: [] },
    { kind: 'connector', id: 'portal', requires: [], optional: [] },
    { kind: 'connector', id: 'checks', requires: [], optional: [] },
    { kind: 'module', id: 'sales', requires: ['portal'], optional: ['billing'] },
    { kind: 'module', id: 'hiring', requires: ['checks'], optional: [] },
  ]
}

it('derives module selections and removes dependents before their required connectors', () => {
  const pieces = fixture()
  const combos = combinations(pieces)
  expect(combos.map((combo) => combo.name)).toEqual([
    'everything',
    'sales-only',
    'sales-without-billing',
    'hiring-only',
  ])
  expect(combos[0].remove).toEqual([])
  expect(combos.find((combo) => combo.name === 'sales-only').remove).toEqual(['hiring', 'checks'])
  expect(combos.find((combo) => combo.name === 'sales-without-billing').remove).toEqual([
    'billing',
    'hiring',
    'checks',
  ])
  expect(combos.find((combo) => combo.name === 'hiring-only').remove).toEqual([
    'billing',
    'sales',
    'portal',
  ])

  for (const combo of combos) {
    const installed = new Map(pieces.map((piece) => [piece.id, piece]))

    for (const id of combo.remove) {
      expect([...installed.values()].some((piece) => piece.requires.includes(id))).toBe(false)
      installed.delete(id)
    }

    expect(installed.has('core')).toBe(true)
  }
})

it('drops absent modules and optional connectors from the public repo matrix', () => {
  const pieces = fixture().filter((piece) => !['hiring', 'checks', 'billing'].includes(piece.id))
  expect(combinations(pieces)).toEqual([
    { name: 'everything', remove: [] },
    { name: 'sales-only', remove: [] },
  ])
})

it('keeps transitive dependencies and refuses optional variations required elsewhere', () => {
  const pieces = fixture()
  pieces.find((piece) => piece.id === 'portal').requires.push('billing')
  const combos = combinations(pieces)
  expect(combos.some((combo) => combo.name === 'sales-without-billing')).toBe(false)
  expect(combos.find((combo) => combo.name === 'sales-only').remove).toEqual(['hiring', 'checks'])
  expect(combos.find((combo) => combo.name === 'hiring-only').remove).toEqual([
    'sales',
    'portal',
    'billing',
  ])
})

it('rejects cycles in the removal graph before any removal runs', () => {
  const pieces = fixture()
  pieces.find((piece) => piece.id === 'checks').requires.push('hiring')
  expect(() => combinations(pieces)).toThrow('Circular required piece dependencies')
})

it('includes requested Portal proofs before and after CRM makes Portal optional', () => {
  const pieces = fixture()
  const module = pieces.find((piece) => piece.id === 'sales')
  module.id = 'crm'
  pieces.find((piece) => piece.id === 'billing').id = 'stripe'
  module.optional = ['stripe']
  const before = combinations(pieces)
  expect(before.find((combo) => combo.name === 'crm-without-portal').remove).toEqual([
    'portal',
    'hiring',
    'checks',
  ])
  expect(before.find((combo) => combo.name === 'crm-without-portal-stripe').remove).toEqual([
    'stripe',
    'portal',
    'hiring',
    'checks',
  ])
  module.requires = []
  module.optional = ['portal', 'stripe']
  expect(combinations(pieces).filter((combo) => combo.name === 'crm-without-portal')).toHaveLength(
    1,
  )
  const publicPieces = pieces.filter((piece) => !['portal', 'stripe'].includes(piece.id))
  expect(combinations(publicPieces).some((combo) => combo.name.startsWith('crm-without-'))).toBe(
    false,
  )
})
