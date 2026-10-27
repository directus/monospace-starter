import { afterEach, expect, it, vi } from 'vitest'

import { StripeClient } from './client'
import { parseConfig } from './config'
import { executeQuery } from './query'

const customerId = 'cus_MonoErp0011'

const charge = {
  id: 'ch_MonoErp0011202608',
  customer: customerId,
  amount: 99900,
  currency: 'usd',
  status: 'failed',
  created: 1785844800,
}

afterEach(() => vi.unstubAllGlobals())

it.each(['equals', 'in'])(
  'reads customer charges through a %s relation filter',
  async (operator) => {
    const requested: string[] = []

    vi.stubGlobal('fetch', async (url: URL) => {
      const customer = url.searchParams.get('customer') ?? ''
      requested.push(customer)

      return Response.json({ data: customer === customerId ? [charge] : [], has_more: false })
    })

    const config = parseConfig({ apiKey: 'sk_test_fixture', apiBase: 'http://stripe.test' })
    const result = await executeQuery(
      { config, client: new StripeClient(config.apiKey, config.apiBase) },
      {
        query: {
          op: 'readMany',
          collection: 'charges',
          select: ['id', 'status'],
          filter:
            operator === 'in'
              ? { in: { field: 'customer' }, values: [customerId] }
              : { cmp: 'equals', left: { field: 'customer' }, right: { value: customerId } },
        },
      },
    )

    expect(requested).toEqual([customerId])
    expect(result).toEqual({ records: [{ id: charge.id, status: 'failed' }] })
  },
)
