import { afterEach, describe, expect, it, vi } from 'vitest'

import { fromDateInput, fromDateTimeInput, laterToday, nextWeek, toDateTimeInput } from './dates'

afterEach(() => vi.useRealTimers())

describe('local date inputs', () => {
  it('round trips local date and time without a timezone shift', () => {
    const value = '2026-10-27T09:30'
    expect(toDateTimeInput(fromDateTimeInput(value))).toBe(value)
    const day = new Date(fromDateInput('2026-10-27') ?? '')
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([
      2026, 9, 27, 9,
    ])
    expect(fromDateInput('')).toBeNull()
    expect(fromDateTimeInput('')).toBeNull()
  })

  it('chooses next Monday at nine even when today is Monday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 26, 10))
    const next = new Date(nextWeek())
    expect([next.getMonth(), next.getDate(), next.getHours()]).toEqual([10, 2, 9])
  })

  it('offers a round hour at least thirty minutes away', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 27, 10, 45))
    const later = new Date(laterToday())
    expect([later.getHours(), later.getMinutes()]).toEqual([12, 0])
    expect(later.getTime() - Date.now()).toBeGreaterThanOrEqual(30 * 60_000)
  })
})
