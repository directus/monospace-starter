import { describe, expect, it } from 'vitest'

import { billingSummary, chargeAmount } from './billing'

describe('billingSummary', () => {
  it('adds up paid charges only and reports the newest charge as the last payment', () => {
    const summary = billingSummary([
      { amount: '99900', status: 'failed', created: '2026-08-04T12:00:00Z' },
      { amount: '99900', status: 'succeeded', created: '2026-07-04T12:00:00Z' },
      { amount: '4900', status: 'succeeded', created: '2026-06-04T12:00:00Z' },
    ])

    expect(summary).toEqual({
      lifetimeValue: '1048',
      paymentCount: 2,
      failedCount: 1,
      lastPayment: { amount: '99900', status: 'failed', created: '2026-08-04T12:00:00Z' },
    })
  })

  it('has no last payment and zero value without charges', () => {
    expect(billingSummary([])).toEqual({
      lifetimeValue: '0',
      paymentCount: 0,
      failedCount: 0,
      lastPayment: null,
    })
  })
})

describe('chargeAmount', () => {
  it('converts cents to dollars', () => {
    expect(chargeAmount({ amount: '29900' })).toBe('299')
    expect(chargeAmount({ amount: null })).toBeNull()
  })
})
