import assert from 'node:assert/strict'

import { authenticate, request, workspacePath } from '../../../../infra/monospace/setup/lib.mjs'

await authenticate()

const cases = [
  { account: 'acct-0011', customer: 'cus_MonoErp0011', count: 24, latest: 'failed' },
  { account: 'acct-0001', customer: 'cus_MonoErp0001', count: 30, latest: 'succeeded' },
  { account: 'acct-0002', customer: 'cus_MonoErp0002', count: 29, latest: 'succeeded' },
  { account: 'acct-0003', customer: 'cus_MonoErp0003', count: 29, latest: 'succeeded' },
  { account: 'acct-0004', customer: 'cus_MonoErp0004', count: 0 },
]

for (const expected of cases) {
  const params = new URLSearchParams({
    'fields[0]': 'id',
    'include[stripeCustomer][fields][0]': 'id',
    'include[stripeCustomer][include][charges][fields][0]': 'id',
    'include[stripeCustomer][include][charges][fields][1]': 'status',
    'include[stripeCustomer][include][charges][sort][0][created][direction]': 'desc',
    'include[stripeCustomer][include][charges][limit]': '100',
  })

  const { data } = await request(`${workspacePath}/items/accounts/${expected.account}?${params}`)
  const customer = data.stripeCustomer

  assert.equal(customer?.id, expected.customer, `${expected.account}: linked Stripe customer`)
  const charges = customer.charges?.data ?? []
  assert.equal(charges.length, expected.count, `${expected.customer}: payment history`)

  if (expected.latest) assert.equal(charges[0]?.status, expected.latest, 'latest payment status')
  assert.equal(
    charges.filter((charge) => charge.status === 'failed').length,
    expected.latest === 'failed' ? 1 : 0,
    `${expected.customer}: failed payments`,
  )
  console.log(
    `${expected.customer}: ${charges.length} charges, latest ${charges[0]?.status ?? 'none'}`,
  )
}
