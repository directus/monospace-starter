import '@/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { z } from 'zod'

import { activitiesCreateSchema, dealsUpdateSchema } from '@/generated/monospace/schemas'
import { sessionQuery } from '@/lib/auth'
import { userPoliciesQuery } from '@/lib/permissions'
import { CloseDealDialog } from '@/modules/crm/components/close-deal-dialog'
import type { PipelineStage } from '@/modules/crm/data'
import { useCloseDeal } from '@/modules/crm/mutations'
import { signedIn, worker } from '@/test/msw'

const id = '00000000-0000-4000-8000-000000000001'

const stage = {
  id,
  name: 'Won',
  isClosed: true,
  isWon: true,
  position: 6,
  color: null,
} satisfies PipelineStage

afterEach(cleanup)

function ClosingDeal() {
  const close = useCloseDeal()

  return (
    <CloseDealDialog
      stage={stage}
      valueAmount="500"
      currency="EUR"
      expectedCloseDate="2026-10-27"
      pending={close.isPending}
      onOpenChange={() => undefined}
      onConfirm={(values) =>
        close.mutateAsync({ ...values, id, organizationId: id, currency: 'EUR', stage })
      }
    />
  )
}

describe('closing a deal', () => {
  it('confirms the value and date, then files the outcome note', async () => {
    const writes: Array<string> = []
    worker.use(
      ...signedIn,
      http.get('/api/monoerp/system/user-role', () =>
        HttpResponse.json({ data: [{ roleId: 'role' }] }),
      ),
      http.get('/api/monoerp/roles/:id/policies', () =>
        HttpResponse.json({ data: [{ access: 'admin' }].map((content) => ({ content })) }),
      ),
      http.patch('/api/monoerp/items/deals/:id', async ({ request }) => {
        const data = dealsUpdateSchema.parse(await request.json())
        expect(data).toMatchObject({
          stageId: id,
          status: 'won',
          valueAmount: '600',
          expectedCloseDate: '2026-10-27',
        })
        writes.push('deal')

        return HttpResponse.json({ data: { id } })
      }),
      http.post('/api/monoerp/items/activities', async ({ request }) => {
        const [data] = z.array(activitiesCreateSchema).parse(await request.json())
        expect(data).toMatchObject({
          type: 'note',
          status: 'completed',
          body: 'Approved the proposal',
        })
        writes.push('note')

        return HttpResponse.json({ data: [{ id }] })
      }),
    )
    const client = new QueryClient()
    client.setQueryData(sessionQuery().queryKey, {
      id,
      email: 'admin@example.com',
      fullName: 'Admin',
      avatarId: null,
    })

    client.setQueryData(userPoliciesQuery(id).queryKey, [{ access: 'admin' }])

    render(
      <QueryClientProvider client={client}>
        <ClosingDeal />
      </QueryClientProvider>,
    )
    await page.getByRole('textbox', { name: 'Final value (EUR)' }).fill('600')
    await page.getByRole('textbox', { name: 'Win notes' }).fill('Approved the proposal')
    await page.getByRole('button', { name: 'Mark won' }).click()
    await expect.poll(() => writes).toEqual(['deal', 'note'])
    await expect.element(page.getByRole('button', { name: 'Mark won' })).toBeEnabled()
  })
})
