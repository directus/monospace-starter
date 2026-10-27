import '@/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { interactionsCreateSchema, interactionsUpdateSchema } from '@/generated/monospace/schemas'
import { sessionQuery } from '@/lib/auth'
import { collectionPermissionsQuery } from '@/lib/permissions'
import { ActivityDetailDrawer } from '@/modules/crm/components/activity-detail'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { ActivityRecord } from '@/modules/crm/data'
import { signedIn, worker } from '@/test/msw'

const copy = crmCopy.activity.sheet

const row: ActivityRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  subject: 'Review the renewal',
  type: 'call',
  status: 'open',
  body: 'Discuss the revised proposal and confirm the decision process.\n'.repeat(20).trim(),
  direction: 'outbound',
  occurredAt: null,
  dueAt: null,
  completedAt: null,
  ownerUserId: null,
  owner: null,
  organizationId: null,
  contactId: null,
  opportunityId: null,
  organizations: null,
  contacts: null,
  opportunities: null,
  attachments: { data: [] },
}

// Activity writes the fake server received, in order.
function serve() {
  const writes: Array<{ method: string; id?: string; data: object }> = []

  worker.use(
    ...signedIn,
    http.get('/api/monoerp/system/user-role', () =>
      HttpResponse.json({ data: [{ roleId: 'role' }] }),
    ),
    http.get('/api/monoerp/roles/:id/policies', () =>
      HttpResponse.json({ data: [{ content: { access: 'admin' } }] }),
    ),
    http.patch('/api/monoerp/items/interactions/:id', async ({ params, request }) => {
      const id = String(params.id)
      writes.push({
        method: 'PATCH',
        id,
        data: interactionsUpdateSchema.parse(await request.json()),
      })

      return HttpResponse.json({ data: { id } })
    }),
    http.post('/api/monoerp/items/interactions', async ({ request }) => {
      writes.push({
        method: 'POST',
        data: interactionsCreateSchema.array().parse(await request.json()),
      })

      return HttpResponse.json({ data: [{ id: '00000000-0000-4000-8000-000000000002' }] })
    }),
  )

  return writes
}

async function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  const user = await client.ensureQueryData(sessionQuery())
  await client.ensureQueryData(collectionPermissionsQuery(user.id, 'interactions'))

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

afterEach(async () => {
  cleanup()
  await page.viewport(1100, 900)
})

describe('Activity drawer layout', () => {
  it.each([
    { width: 375, height: 360 },
    { width: 667, height: 320 },
  ])('keeps only completion actions pinned at $width × $height', async ({ width, height }) => {
    await page.viewport(width, height)
    const writes = serve()
    const onOpenChange = vi.fn()
    await renderWithClient(
      <ActivityDetailDrawer
        row={row}
        mode="view"
        onModeChange={vi.fn()}
        onOpenChange={onOpenChange}
        onDelete={vi.fn()}
      />,
    )
    const complete = page.getByRole('button', { name: copy.complete, exact: true })
    await expect.element(complete).toBeVisible()
    const outcome = screen.getByRole('textbox', { name: copy.outcome })
    const footer = complete.element().closest('footer')!
    expect(footer.contains(outcome)).toBe(false)
    expect(footer.clientHeight).toBeLessThan(80)

    let body = outcome.parentElement!

    while (getComputedStyle(body).overflowY !== 'auto') body = body.parentElement!
    expect(body.clientHeight).toBeGreaterThan(height * 0.5)
    const footerTop = footer.getBoundingClientRect().top
    await page
      .getByRole('textbox', { name: copy.outcome, exact: true })
      .fill('Agreed on the next steps')
    await page.getByRole('button', { name: copy.nextStep, exact: true }).click()
    expect(footer.getBoundingClientRect().top).toBeCloseTo(footerTop, 0)
    const next = screen.getByRole('textbox', { name: copy.nextStep })
    expect(body.contains(next)).toBe(true)
    expect(footer.contains(next)).toBe(false)
    expect(body.scrollTop).toBeGreaterThan(0)
    body.scrollTop = body.scrollHeight
    expect(next.getBoundingClientRect().bottom).toBeLessThan(footer.getBoundingClientRect().top)
    await page.screenshot()

    await complete.click()
    await expect.poll(() => onOpenChange.mock.calls).toEqual([[false]])
    expect(writes).toEqual([
      {
        method: 'PATCH',
        id: row.id,
        data: {
          status: 'completed',
          completedAt: expect.any(String),
          body: `${row.body}\n\nAgreed on the next steps`,
        },
      },
    ])
  })

  it('keeps completed activity details scrollable with a compact reopen footer', async () => {
    await page.viewport(375, 360)
    serve()
    await renderWithClient(
      <ActivityDetailDrawer
        row={{ ...row, status: 'completed', completedAt: '2026-09-04T12:00:00.000Z' }}
        mode="view"
        onModeChange={vi.fn()}
        onOpenChange={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    const reopen = page.getByRole('button', { name: copy.reopen, exact: true })
    await expect.element(reopen).toBeVisible()
    expect(screen.queryByRole('textbox', { name: copy.outcome })).toBeNull()
    const footer = reopen.element().closest('footer')!
    expect(footer.clientHeight).toBeLessThan(80)
    const dialog = page.getByRole('dialog').element()
    const help = document.getElementById(dialog.getAttribute('aria-describedby')!)!
    const body = help.parentElement!
    expect(getComputedStyle(body).overflowY).toBe('auto')
    expect(body.clientHeight).toBeGreaterThan(180)
    const footerTop = footer.getBoundingClientRect().top
    body.scrollTop = body.scrollHeight
    expect(body.scrollTop).toBeGreaterThan(0)
    expect(footer.getBoundingClientRect().top).toBeCloseTo(footerTop, 0)
  })
})
