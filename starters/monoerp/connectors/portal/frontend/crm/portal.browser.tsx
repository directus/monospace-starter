import '@/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  organizationPanels,
  organizationLists,
  contactPanels,
  dealSummaries,
} from '@/modules/crm/slots'
import { signedIn, worker } from '@/test/msw'

import feature from './feature'
import { PortalPanel } from './portal-panel'
import { portalCopy } from './portal.copy'

const account = {
  id: 'acct-0001',
  name: 'Apple portal account',
  status: 'active',
  subscriptions: {
    data: [
      { id: 'sub-1', status: 'active', seats: 10, plan: { name: 'Team', monthlyPrice: '299' } },
    ],
  },
  users: { data: [] },
  tickets: { data: [] },
  events: { data: [{ id: 'evt-1', type: 'login', occurredAt: '2026-10-01T12:00:00Z' }] },
}

beforeEach(() => worker.use(...signedIn))

afterEach(cleanup)

it('refreshes an expired session and shares the Portal panel/history read', async () => {
  const requests: string[] = []
  const panel = organizationPanels.find(({ id }) => id === feature.id)

  if (!panel?.historyQuery) throw new Error('Portal contribution missing')
  const Panel = panel.component

  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })

  worker.use(
    http.get('/api/monoerp/items/accounts/:id', ({ params }) => {
      requests.push(String(params.id))

      if (requests.length === 1)
        return HttpResponse.json({ message: 'Session expired' }, { status: 401 })

      return HttpResponse.json({ data: account })
    }),
  )
  render(
    <QueryClientProvider client={client}>
      <Panel organization={{ portalAccountId: 'acct-0001' }} />
    </QueryClientProvider>,
  )

  await expect.poll(() => screen.queryByText('Apple portal account')).not.toBeNull()
  expect(screen.getByText('Team')).toBeTruthy()
  expect(
    await client.query(panel.historyQuery({ organization: { portalAccountId: 'acct-0001' } })),
  ).toHaveLength(1)
  expect(requests).toEqual(['acct-0001', 'acct-0001'])
  expect(organizationLists.flatMap((list) => list.columns.map(({ id }) => id))).toEqual([
    'plan',
    'seats',
    'renewsAt',
    'tickets',
  ])
  expect(contactPanels.map(({ id }) => id)).toContain('portal')
  expect(dealSummaries.map(({ id }) => id)).toContain('portal')
})

it('batches visible organization accounts across all Portal columns', async () => {
  const requests: string[] = []

  worker.use(
    http.get('/api/monoerp/items/accounts', ({ request }) => {
      requests.push(request.url)

      return HttpResponse.json({ data: [account] })
    }),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      {organizationLists.flatMap((list) =>
        list.columns.map(({ id, component: Cell }) => (
          <Cell
            key={id}
            organization={{ portalAccountId: 'acct-0001' }}
            organizations={[{ portalAccountId: 'acct-0001' }, { portalAccountId: 'acct-0002' }]}
          />
        )),
      )}
    </QueryClientProvider>,
  )

  await expect.poll(() => screen.queryByText('Team')).not.toBeNull()
  expect(screen.getByText('0 of 10')).toBeTruthy()
  expect(requests).toHaveLength(1)
})

it('keeps a retry inside the Portal panel when MySQL fails', () => {
  const retry = vi.fn()

  render(
    <PortalPanel
      connected
      account={undefined}
      pending={false}
      error={new Error('Query failed')}
      onRetry={retry}
    />,
  )
  screen.getByRole('button', { name: 'Try again' }).click()
  expect(retry).toHaveBeenCalledOnce()
})

it('explains how to link an organization without a Portal account', () => {
  render(
    <PortalPanel
      connected={false}
      account={undefined}
      pending={false}
      error={null}
      onRetry={vi.fn()}
    />,
  )
  expect(screen.getByText(portalCopy.organizations.portal.connect)).toBeTruthy()
})
