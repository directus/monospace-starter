import { describe, expect, it } from 'vitest'

import { affiliationSpan, groupAffiliations, groupTitle } from './affiliations'

const org = (id: string) => ({ organization: { id } })

describe('groupAffiliations', () => {
  it('collapses repeat roles at one organization and leads with the open one', () => {
    const groups = groupAffiliations(
      [
        {
          id: 'a',
          title: 'Previous role',
          startedAt: '2019-01-25',
          endedAt: '2022-12-07',
          ...org('acme'),
        },
        { id: 'b', title: 'Board advisor', startedAt: '2024-01-25', endedAt: null, ...org('acme') },
        {
          id: 'c',
          title: 'VP',
          startedAt: '2021-01-01',
          endedAt: null,
          isPrimary: true,
          ...org('globex'),
        },
      ],
      (row) => row.organization.id,
    )

    expect(groups.map((group) => group.key)).toEqual(['globex', 'acme'])
    const acme = groups[1]!
    expect(acme.roles.map((row) => row.id)).toEqual(['b', 'a'])
    expect(acme.current?.id).toBe('b')
    expect(acme.isFormer).toBe(false)
    expect(groupTitle(acme)).toBe('Board advisor')
  })

  it('marks a group former only when every role has ended, and sorts it last', () => {
    const groups = groupAffiliations(
      [
        { id: 'a', title: 'Old', startedAt: '2018-01-01', endedAt: '2020-01-01', ...org('acme') },
        { id: 'b', title: 'Now', startedAt: '2023-01-01', endedAt: null, ...org('globex') },
      ],
      (row) => row.organization.id,
    )

    expect(groups.map((group) => [group.key, group.isFormer])).toEqual([
      ['globex', false],
      ['acme', true],
    ])
    expect(groupTitle(groups[1]!)).toBe('Old')
  })
})

describe('affiliationSpan', () => {
  const now = Date.UTC(2026, 9, 15)

  it('shows the range with tenure, present for open roles, and nothing when undated', () => {
    expect(affiliationSpan({ startedAt: '2023-01-15', endedAt: '2025-10-01' }, now)).toBe(
      'Jan 2023 – Oct 2025 · 2 yrs 9 mos',
    )
    expect(affiliationSpan({ startedAt: '2026-02-01', endedAt: null }, now)).toBe(
      'Feb 2026 – Present · 8 mos',
    )
    expect(affiliationSpan({ startedAt: null, endedAt: '2022-12-07' }, now)).toBe('Until Dec 2022')
    expect(affiliationSpan({ startedAt: null, endedAt: null }, now)).toBeNull()
  })
})
