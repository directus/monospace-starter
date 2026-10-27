import { describe, expect, it } from 'vitest'

import { dateField } from '@/components/filters/filter-date-editor'

import { filtersToClause } from './filters'
import type { ListFilterField, ListFilterQuery } from './filters'
import { listSearchSchema } from './list-search'

const fields: Array<ListFilterField> = [
  { id: 'status', label: 'Status', type: 'select', kind: 'option' },
  { id: 'title', label: 'Title', type: 'text', kind: 'text' },
  dateField({ id: 'closeDate', label: 'Close date', path: 'expectedCloseDate' }),
]

// The router writes search params as JSON, so `undefined` values are gone by the time they're read.
function throughUrl(filters: ListFilterQuery) {
  return listSearchSchema.parse(JSON.parse(JSON.stringify({ filters }))).filters
}

function group(rules: ListFilterQuery['rules']): ListFilterQuery {
  return { rules }
}

describe('list filters in the URL', () => {
  it('keeps rules that carry a value', () => {
    const filters = throughUrl(
      group([
        { id: 'a', type: 'rule', path: ['status'], operator: 'is_any_of', value: ['open', 'won'] },
        { id: 'b', type: 'rule', path: ['title'], operator: 'contains', value: 'renewal' },
      ]),
    )

    expect(filtersToClause(fields, filters)).toEqual({
      _and: [{ status: { _in: ['open', 'won'] } }, { title: { _icontains: 'renewal' } }],
    })
  })

  it('keeps "is empty" rules, which have no value once through JSON', () => {
    const filters = throughUrl(
      group([{ id: 'a', type: 'rule', path: ['title'], operator: 'empty', value: undefined }]),
    )

    expect(filtersToClause(fields, filters)).toEqual({ _and: [{ title: { _null: true } }] })
  })

  it('keeps date rules', () => {
    const filters = throughUrl(
      group([
        {
          id: 'a',
          type: 'rule',
          path: ['closeDate'],
          operator: 'is_before',
          value: { date: '2026-10-01' },
        },
      ]),
    )

    expect(filtersToClause(fields, filters)).toEqual({
      _and: [{ expectedCloseDate: { _lt: '2026-10-01' } }],
    })
  })

  it('drops old group and or URLs without failing the page', () => {
    for (const combinator of ['and', 'or']) {
      expect(
        listSearchSchema.parse({
          q: 'acme',
          filters: { id: 'root', type: 'group', combinator, rules: [] },
        }),
      ).toEqual({ q: 'acme', filters: undefined })
    }

    expect(
      listSearchSchema.parse({
        filters: { rules: [{ id: 'old', type: 'group', combinator: 'or', rules: [] }] },
      }).filters,
    ).toBeUndefined()
  })

  it('drops filters it cannot read instead of failing the page', () => {
    expect(
      listSearchSchema.parse({ q: 'acme', filters: { type: 'group', rules: 'nope' } }),
    ).toEqual({ q: 'acme', filters: undefined })
  })
})
