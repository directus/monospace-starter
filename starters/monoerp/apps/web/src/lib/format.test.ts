import { describe, expect, it } from 'vitest'

import { formatDue, formatRelative, parseDate } from './format'

describe('date labels', () => {
  it('reads date-only values in the local calendar', () => {
    const day = parseDate('2026-10-27')
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([
      2026, 9, 27, 0,
    ])
  })

  it('labels due dates relative to local midnight', () => {
    const now = new Date(2026, 9, 27, 12).getTime()
    expect(formatDue(new Date(2026, 9, 27, 9).toISOString(), now)).toContain('Today')
    expect(formatDue(new Date(2026, 9, 28, 9).toISOString(), now)).toContain('Tomorrow')
    expect(formatDue(null, now)).toBe('')
    expect(formatRelative(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 hours ago')
  })
})
