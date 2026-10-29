import { afterEach, expect, it, vi } from 'vitest'

import { schemaRelation } from './schema-relations.mjs'

const collection = { source: 'App', dbName: 'organizations', relationFields: [] }

const optional = { source: 'Portal', collection: 'accounts', owner: 'portal' }

const portal = { source: 'Portal', dbName: 'accounts' }

afterEach(() => vi.restoreAllMocks())

it('skips an optional relation with one message when its source or owner is absent', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  expect(
    schemaRelation('app.json', collection, 'portalAccount', optional, [collection], () => true),
  ).toBeUndefined()
  expect(log).toHaveBeenCalledExactlyOnceWith(
    "app.json: organizations.portalAccount skipped, optional target Portal.accounts isn't connected or selected",
  )
  expect(
    schemaRelation('app.json', collection, 'portalAccount', optional, [portal], () => false),
  ).toBeUndefined()
})

it('fails a missing required relation, even when a connector is absent', () => {
  expect(() =>
    schemaRelation('app.json', collection, 'owner', undefined, [collection], () => false),
  ).toThrow('organizations.owner is not a relation')
})

it('fails an optional relation when its source and owner are present but the join is not', () => {
  expect(() =>
    schemaRelation('app.json', collection, 'portalAccount', optional, [portal], () => true),
  ).toThrow('organizations.portalAccount is not a relation')
})

it('returns an existing relation by its original or renamed API name without logging', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const relation = { id: 'relation-id', apiName: 'organization' }
  const deals = { dbName: 'deals', relationFields: [relation] }

  expect(
    schemaRelation(
      'crm/app.json',
      deals,
      'organizations',
      optional,
      [],
      () => false,
      'organization',
    ),
  ).toBe(relation)
  expect(log).not.toHaveBeenCalled()
})
