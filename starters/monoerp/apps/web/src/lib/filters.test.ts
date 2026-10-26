import { describe, expect, it } from 'vitest'

import { dateField } from '@/components/filter-date-editor'
import { DEFAULT_FILTER_OPERATORS } from '@/components/reui/filters/filters-operators'

import { operatorClause } from './filters'
import type { FilterValue, ListFilterField } from './filters'

const text: ListFilterField = { id: 'name', label: 'Name', type: 'text' }

const amount: ListFilterField = { id: 'amount', label: 'Amount', type: 'number', kind: 'number' }

const status: ListFilterField = { id: 'status', label: 'Status', type: 'select', kind: 'option' }

const closeDate = dateField({ id: 'closeDate', label: 'Close date' })

function clause(field: ListFilterField, operator: string, value?: FilterValue) {
  return operatorClause(field, { id: 'r', type: 'rule', path: [field.id], operator, value })
}

describe('operatorClause', () => {
  it.each([
    [text, 'contains', 'acme', { _icontains: 'acme' }],
    [text, 'not_contains', 'acme', { _nicontains: 'acme' }],
    [text, 'starts_with', 'ac', { _starts_with: 'ac' }],
    [text, 'ends_with', 'me', { _ends_with: 'me' }],
    [text, 'is', 'Acme', { _eq: 'Acme' }],
    [text, 'is_not', 'Acme', { _neq: 'Acme' }],
    [text, 'empty', undefined, { _null: true }],
    [text, 'not_empty', undefined, { _null: false }],
    [amount, 'eq', 5, { _eq: '5' }],
    [amount, 'neq', 5, { _neq: '5' }],
    [amount, 'gt', 5, { _gt: '5' }],
    [amount, 'gte', 5, { _gte: '5' }],
    [amount, 'lt', 5, { _lt: '5' }],
    [amount, 'lte', 5, { _lte: '5' }],
    [amount, 'between', [1, 9], { _between: ['1', '9'] }],
    [amount, 'not_between', [1, 9], { _nbetween: ['1', '9'] }],
    [status, 'is', 'open', { _eq: 'open' }],
    [status, 'is_not', 'open', { _neq: 'open' }],
    [status, 'is_any_of', ['open', 'won'], { _in: ['open', 'won'] }],
    [status, 'is_none_of', ['open', 'won'], { _nin: ['open', 'won'] }],
    [closeDate, 'is_before', { date: '2026-10-01' }, { _lt: '2026-10-01' }],
    [closeDate, 'is_after', { date: '2026-10-01' }, { _gt: '2026-10-01' }],
    [closeDate, 'is_on_or_before', { date: '2026-10-01' }, { _lte: '2026-10-01' }],
    [closeDate, 'is_on_or_after', { date: '2026-10-01' }, { _gte: '2026-10-01' }],
    [
      closeDate,
      'between',
      [{ date: '2026-10-01' }, { date: '2026-10-31' }],
      { _between: ['2026-10-01', '2026-10-31'] },
    ],
  ] satisfies Array<[ListFilterField, string, FilterValue, object]>)(
    'turns %#: %s %s into its Monospace operator',
    (field, operator, value, expected) => {
      expect(clause(field, operator, value)).toEqual(expected)
    },
  )

  it('covers every operator the catalog offers', () => {
    const offered = Object.values(DEFAULT_FILTER_OPERATORS).flat()

    for (const operator of offered) {
      expect(operator.clause).toMatch(/^_/)
    }

    expect(offered.map((operator) => operator.value)).not.toContain('has_all_of')
  })

  it('drops a rule whose operator the field does not offer', () => {
    expect(clause(text, 'is_any_of', ['a'])).toBeNull()
    expect(clause(status, 'has_all_of', ['open'])).toBeNull()
  })

  it('drops a rule that is missing its value or half a range', () => {
    expect(clause(text, 'contains', '')).toBeNull()
    expect(clause(amount, 'between', [1, undefined])).toBeNull()
  })
})
