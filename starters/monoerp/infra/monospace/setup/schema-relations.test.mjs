import { afterEach, describe, expect, it, vi } from 'vitest'

import { schemaRelation } from './schema-relations.mjs'

const collection = { source: 'CRM', dbName: 'organizations', relationFields: [] }

const optional = { source: 'Portal', collection: 'accounts', owner: 'portal' }

const portal = { source: 'Portal', dbName: 'accounts' }

afterEach(() => vi.restoreAllMocks())

describe('schema relation presentation', () => {
  it('skips an optional relation with one clear message when its target is absent', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(
      schemaRelation('crm.json', collection, 'portalAccount', optional, [collection], () => true),
    ).toBeUndefined()
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "crm.json: organizations.portalAccount skipped, optional target Portal.accounts isn't connected or selected",
    )
  })

  it('skips only the optional relation for a disabled connector left in the workspace', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(
      schemaRelation('crm.json', collection, 'portalAccount', optional, [portal], () => false),
    ).toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('skips a reverse join when its module collection is absent from a shared source', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(
      schemaRelation(
        'portal.json',
        { ...portal, relationFields: [] },
        'organization',
        { source: 'CRM', collection: 'organizations', owner: 'crm' },
        [{ source: 'CRM', dbName: 'jobs' }],
        () => false,
      ),
    ).toBeUndefined()
  })

  it('fails a missing required relation', () => {
    expect(() =>
      schemaRelation('crm.json', collection, 'owner', undefined, [collection], () => true),
    ).toThrow('organizations.owner is not a relation')
  })

  it('fails a typo in a required relation even when a connector is absent', () => {
    expect(() =>
      schemaRelation('crm.json', collection, 'owenr', undefined, [collection], () => false),
    ).toThrow('organizations.owenr is not a relation')
  })

  it('fails an optional relation when its target is connected and selected', () => {
    expect(() =>
      schemaRelation('crm.json', collection, 'portalAccount', optional, [portal], () => true),
    ).toThrow('organizations.portalAccount is not a relation')
  })

  it('applies an existing optional relation without logging a skip', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const relation = { id: 'relation-id', apiName: 'portalAccount' }

    expect(
      schemaRelation(
        'crm.json',
        { ...collection, relationFields: [relation] },
        'portalAccount',
        optional,
        [collection],
        () => false,
      ),
    ).toBe(relation)
    expect(log).not.toHaveBeenCalled()
  })

  it('fails when a selected optional source is connected but its target table is missing', () => {
    expect(() =>
      schemaRelation(
        'crm.json',
        collection,
        'portalAccount',
        optional,
        [{ source: 'Portal', dbName: 'users' }],
        () => true,
      ),
    ).toThrow('organizations.portalAccount is not a relation')
  })
})
