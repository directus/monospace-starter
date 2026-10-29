import { describe, expect, it } from 'vitest'
import { z } from 'zod'

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

import { bucketClause, upcomingBucket } from './activity'

describe('activity due buckets', () => {
  const at = new Date(2026, 9, 27, 12).getTime()
  const date = (days: number, hours = 0) => new Date(2026, 9, 27 + days, hours).toISOString()

  it.each([
    ['overdue', date(-1, 23)],
    ['today', date(0)],
    ['today', date(0, 23)],
    ['week', date(1)],
    ['week', date(6, 23)],
    ['later', date(7)],
  ] as const)('uses the same %s boundary on the client and server', (bucket, dueAt) => {
    expect(upcomingBucket({ dueAt }, at)).toBe(bucket)
    const clause = bucketClause(bucket, at)

    const range = z
      .object({ _gte: z.string().optional(), _lt: z.string().optional() })
      .parse(clause.dueAt)

    const time = new Date(dueAt).getTime()

    if (range) {
      if ('_gte' in range && range._gte)
        expect(time).toBeGreaterThanOrEqual(new Date(range._gte).getTime())

      if ('_lt' in range && range._lt) expect(time).toBeLessThan(new Date(range._lt).getTime())
    }
  })

  it('keeps undated tasks out of dated buckets even when they have an occurrence', () => {
    expect(upcomingBucket({ dueAt: null, occurredAt: date(0) }, at)).toBe('noDate')
    expect(bucketClause('noDate', at)).toEqual({ dueAt: { _null: true } })
  })
})
