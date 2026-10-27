import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { Toaster } from '@/components/ui/sonner'
import { interactionsUpdateSchema } from '@/generated/monospace/schemas'
import { useUpdateActivity } from '@/modules/crm/mutations'
import { worker } from '@/test/msw'

const id = '00000000-0000-4000-8000-000000000001'

afterEach(cleanup)

function CompleteActivity() {
  const update = useUpdateActivity()

  return (
    <button
      type="button"
      onClick={() =>
        update.mutate({
          id,
          data: { status: 'completed', completedAt: '2026-09-04T12:00:00.000Z' },
        })
      }
    >
      Complete task
    </button>
  )
}

describe('activity completion', () => {
  it('offers an undo action that reopens the activity', async () => {
    const writes: Array<{ id: string; data: object }> = []

    worker.use(
      http.patch('/api/monoerp/items/interactions/:id', async ({ params, request }) => {
        writes.push({
          id: String(params.id),
          data: interactionsUpdateSchema.parse(await request.json()),
        })

        return HttpResponse.json({ data: { id: params.id } })
      }),
    )

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <CompleteActivity />
        <Toaster duration={60_000} />
      </QueryClientProvider>,
    )

    await page.getByRole('button', { name: 'Complete task' }).click()
    await expect.element(page.getByText('Activity completed')).toBeVisible()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.element(page.getByText('Activity reopened')).toBeVisible()

    expect(writes).toEqual([
      { id, data: { status: 'completed', completedAt: '2026-09-04T12:00:00.000Z' } },
      { id, data: { status: 'open', completedAt: null } },
    ])
  })
})
