import { describe, expect, it } from 'vitest'

import { contactName, contactOption, organizationName, organizationOption } from './entities'

const id = '00000000-0000-4000-8000-000000000001'

describe('CRM names and choices', () => {
  it('uses one restricted name in labels and relation choices', () => {
    expect(contactOption({ id })?.label).toBe(contactName(null))
    expect(organizationOption({ id })?.label).toBe(organizationName(null))
    expect(contactOption(null)).toBeNull()
    expect(organizationOption({ name: 'Hidden id' })).toBeNull()
  })

  it('joins only readable name parts and encodes logo domains', () => {
    expect(contactName({ firstName: 'Ada', lastName: null })).toBe('Ada')
    expect(
      contactOption({ id, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
    ).toMatchObject({ label: 'Ada Lovelace', description: 'ada@example.com' })
    expect(organizationOption({ id, domain: 'example.com/path' })?.image).toBe(
      '/logo/example.com%2Fpath',
    )
  })
})
