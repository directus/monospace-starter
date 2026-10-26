import { describe, expect, it } from 'vitest'

import type { RelationOption } from '@/components/form/relation-combobox'

import { filterRelationOptions } from './activity'

const organizations = [
  { value: '00000000-0000-4000-8000-000000000001', label: 'Atlas Manufacturing' },
  { value: '00000000-0000-4000-8000-000000000002', label: 'Stripe', description: 'Payments' },
] satisfies Array<RelationOption>

describe('filterRelationOptions', () => {
  it('limits organization choices using a case-insensitive label or description match', () => {
    expect(filterRelationOptions(organizations, 'ATLAS')).toEqual([organizations[0]])
    expect(filterRelationOptions(organizations, 'payments')).toEqual([organizations[1]])
    expect(filterRelationOptions(organizations, '')).toEqual(organizations)
  })
})
