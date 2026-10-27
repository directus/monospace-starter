import '@/styles.css'
import { mapEngineError } from '@monospace/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { organizationPanels } from '@/modules/crm/slots'
import { signedIn, worker } from '@/test/msw'

import { BillingPanel } from './billing-panel'
import { billingCopy } from './billing.copy'
import type { StripeCustomer } from './data'
import feature from './feature'

const copy = billingCopy

const customer: StripeCustomer = {
  id: 'cus_MonoErp0011',
  name: 'McKesson',
  email: 'grace.chen@example.com',
  created: '2024-09-04T12:00:00Z',
  charges: {
    data: [
      {
        id: 'ch_2',
        amount: '99900',
        currency: 'usd',
        status: 'failed',
        description: 'Business plan, Aug 2026',
        created: '2026-08-04T12:00:00Z',
      },
      {
        id: 'ch_1',
        amount: '99900',
        currency: 'usd',
        status: 'succeeded',
        description: 'Business plan, Jul 2026',
        created: '2026-07-04T12:00:00Z',
      },
    ],
  },
}

beforeEach(() => worker.use(...signedIn))

afterEach(cleanup)

describe('BillingPanel', () => {
  it('refreshes an expired session when loading the connector contribution', async () => {
    const requests: string[] = []
    const contribution = organizationPanels.find((panel) => panel.id === feature.id)

    if (!contribution) throw new Error('Stripe billing contribution was not discovered')
    const Panel = contribution.component

    worker.use(
      http.get('/api/monoerp/items/accounts/:id', ({ params }) => {
        requests.push(String(params.id))

        if (requests.length === 1)
          return HttpResponse.json({ message: 'Session expired' }, { status: 401 })

        return HttpResponse.json({ data: { id: params.id, stripeCustomer: customer } })
      }),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Panel organization={{ portalAccountId: 'acct-0001' }} />
      </QueryClientProvider>,
    )

    await expect.poll(() => screen.queryByText('Business plan, Aug 2026')).not.toBeNull()
    expect(requests).toEqual(['acct-0001', 'acct-0001'])
  })

  it('sums paid charges and flags a failed last payment', () => {
    render(
      <BillingPanel connected customer={customer} pending={false} error={null} onRetry={vi.fn()} />,
    )

    const lifetime = screen.getByText(copy.lifetimeValue).parentElement

    if (!lifetime) throw new Error('No lifetime value metric')
    expect(within(lifetime).getByText('$999')).toBeTruthy()
    expect(within(lifetime).getByText(copy.paymentCount(1))).toBeTruthy()
    expect(screen.getByText(copy.failedHint)).toBeTruthy()
    expect(screen.getByText('Business plan, Aug 2026')).toBeTruthy()
    expect(screen.getAllByText(copy.chargeStatuses.failed).length).toBeGreaterThan(0)
  })

  it('explains that billing needs a portal account', () => {
    render(
      <BillingPanel
        connected={false}
        customer={undefined}
        pending={false}
        error={null}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(copy.connect)).toBeTruthy()
  })

  it('offers a retry when Stripe is down', () => {
    const onRetry = vi.fn()

    render(
      <BillingPanel
        connected
        customer={undefined}
        pending={false}
        error={new Error('Query failed')}
        onRetry={onRetry}
      />,
    )

    screen.getByRole('button').click()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('says billing is not set up when the workspace has no Stripe', () => {
    const error = mapEngineError(
      {
        message: 'Failed to execute query',
        source: { message: 'Output validation failed: Unknown output field `stripeCustomer`' },
      },
      422,
    )

    render(
      <BillingPanel
        connected
        customer={undefined}
        pending={false}
        error={error}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(copy.notSetUp)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
