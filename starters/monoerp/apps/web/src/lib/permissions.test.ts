import { describe, expect, it } from 'vitest'

import { collectionPermissions } from '@/lib/permissions'

// Shapes copied from policies stored by Monospace: rules are keyed by collection and field API
// name, and each field rule is `{ filter }`.
const salesIntake = {
  access: 'rules',
  itemRules: {
    contacts: { create: {}, read: {} },
    opportunities: { read: { filter: { status: { _eq: 'open' } } } },
  },
  fieldRules: {
    contacts: { create: '*', read: { id: { filter: null } } },
    opportunities: { read: { id: { filter: null }, name: { filter: null } } },
  },
}

const salesRep = {
  access: 'rules',
  itemRules: { organizations: { create: {}, read: {}, update: {}, delete: {} } },
  fieldRules: { organizations: { create: '*', read: '*', update: '*' } },
}

describe('collectionPermissions', () => {
  it('reads item and field rules by API name', () => {
    const deals = collectionPermissions([salesIntake], 'opportunities')

    expect(deals.read).toBe(true)
    expect(deals.update).toBe(false)
    expect(deals.field('name').read).toBe(true)
    expect(deals.field('amount').read).toBe(false)

    const contacts = collectionPermissions([salesIntake], 'contacts')

    expect(contacts.create).toBe(true)
    expect(contacts.field('email').create).toBe(true)
    expect(contacts.field('email').read).toBe(false)
  })

  it('grants every field on a wildcard and nothing on collections without rules', () => {
    const organizations = collectionPermissions([salesRep], 'organizations')

    expect(organizations.delete).toBe(true)
    expect(organizations.field('industry').update).toBe(true)
    expect(collectionPermissions([salesRep], 'contacts').read).toBe(false)
  })

  it('combines roles and lets admin through everything', () => {
    expect(collectionPermissions([salesIntake, salesRep], 'organizations').update).toBe(true)
    expect(collectionPermissions([{ access: 'admin' }], 'anything').field('x').update).toBe(true)
  })
})
