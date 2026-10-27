import { describe, expect, it } from 'vitest'

import { statusForStage, totalsByCurrency } from './deals'

describe('deal totals', () => {
  it('keeps currencies separate and defaults missing currency to USD', () => {
    expect(
      totalsByCurrency([
        { valueAmount: '120', currency: 'USD' },
        { valueAmount: '80', currency: 'EUR' },
        { valueAmount: '30', currency: 'USD' },
        { valueAmount: '10', currency: null },
        { valueAmount: null, currency: 'EUR' },
      ]),
    ).toEqual([
      { currency: 'EUR', total: 80 },
      { currency: 'USD', total: 160 },
    ])
  })

  it('ignores unreadable values and handles an empty board', () => {
    expect(totalsByCurrency([])).toEqual([])
    expect(totalsByCurrency([{ valueAmount: 'invalid', currency: 'GBP' }])).toEqual([
      { currency: 'GBP', total: 0 },
    ])
  })
})

describe('stage outcome', () => {
  it('distinguishes won, lost, and open stages', () => {
    expect(statusForStage({ isWon: true, isClosed: true })).toBe('won')
    expect(statusForStage({ isWon: false, isClosed: true })).toBe('lost')
    expect(statusForStage({ isWon: false, isClosed: false })).toBe('open')
  })
})
