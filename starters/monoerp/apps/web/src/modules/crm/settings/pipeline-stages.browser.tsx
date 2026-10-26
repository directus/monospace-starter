import '@/styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { z } from 'zod'

import { appCopy } from '@/lib/app.copy'
import { PipelineStagesSettings } from '@/modules/crm/settings/pipeline-stages'
import { signedIn, worker } from '@/test/msw'

const names = ['Discovery', 'Evaluation', 'Proposal', 'Negotiation', 'Won', 'Lost']

const colors = ['#6366f1', '#0ea5e9', '#f59e0b', '#a855f7', '#10b981', '#ef4444']

const fieldNames = ['name', 'color', 'position', 'isClosed', 'isWon']

const stagePatch = z.object({ name: z.string(), position: z.number() }).partial()

// What the fake server holds and what it was asked to change, reset before each test.
let rows: Array<{
  id: string
  name: string
  position: number
  color: string
  isClosed: boolean
  isWon: boolean
}> = []

let policies: Array<object> = []

let patches: Array<{ id: string; data: z.infer<typeof stagePatch>; url: URL }> = []

beforeEach(() => {
  rows = names.map((name, index) => ({
    id: `00000000-0000-4000-8006-00000000000${index + 1}`,
    name,
    position: index + 1,
    color: colors[index] ?? '#6366f1',
    isClosed: index >= 4,
    isWon: index === 4,
  }))
  policies = [{ access: 'admin' }]
  patches = []
})

function serve() {
  worker.use(
    ...signedIn,
    http.get('/api/crm/items/pipelineStages', () =>
      HttpResponse.json({ data: [...rows].sort((a, b) => a.position - b.position) }),
    ),
    http.patch('/api/crm/items/pipelineStages/:id', async ({ params, request }) => {
      const id = String(params.id)
      const data = stagePatch.parse(await request.json())
      patches.push({ id, data, url: new URL(request.url) })
      rows = rows.map((row) => (row.id === id ? { ...row, ...data } : row))

      return HttpResponse.json({ data: { id } })
    }),
    http.get('/api/crm/system/user-role', () => HttpResponse.json({ data: [{ roleId: 'role' }] })),
    http.get('/api/crm/roles/:id/policies', () =>
      HttpResponse.json({ data: policies.map((content) => ({ content })) }),
    ),
    // The schema manifest: names are indexes into `strings`.
    http.get('/api/crm/schema', () =>
      HttpResponse.json({
        strings: ['pipelineStages', ...fieldNames],
        monospaceSchema: {
          collections: [
            {
              id: 'stages',
              apiName: 0,
              primitiveFields: fieldNames.map((apiName, index) => ({
                id: apiName,
                apiName: index + 1,
              })),
            },
          ],
        },
      }),
    ),
  )
}

afterEach(async () => {
  cleanup()
  await page.viewport(1100, 900)
})

async function mount() {
  serve()

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-4xl p-6">
        <PipelineStagesSettings />
      </main>
    </QueryClientProvider>,
  )
  await expect.element(page.getByRole('button', { name: 'Move Discovery' })).toBeVisible()

  return client
}

function listOrder() {
  return [...screen.getByRole('list', { name: 'Pipeline stages' }).children].flatMap(
    (item) => item.getAttribute('aria-label') || [],
  )
}

async function keyboardMove() {
  const handle = page.getByRole('button', { name: 'Move Discovery' })
  await expect.element(handle).toBeEnabled()
  handle.element().focus()
  await userEvent.keyboard('[Space]')
  await userEvent.keyboard('[ArrowDown]')
  await userEvent.keyboard('[Space]')
}

describe('pipeline settings', () => {
  it('fits six rows and a compact board preview on desktop, with a working detail preview', async () => {
    await mount()
    const rows = screen.getByRole('list', { name: 'Pipeline stages' })
    expect(rows.getBoundingClientRect().bottom).toBeLessThan(window.innerHeight)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await page.screenshot()
    await page.getByRole('tab', { name: 'Deal detail' }).click()
    await page
      .getByRole('list', { name: 'Pipeline stage', exact: true })
      .getByRole('button', { name: 'Evaluation', exact: true })
      .click()
    expect(
      within(screen.getByRole('list', { name: 'Pipeline stage' }))
        .getByRole('button', { name: 'Evaluation' })
        .getAttribute('aria-current'),
    ).toBe('step')
    expect(patches).toEqual([])
    await page.screenshot()
  })

  it('saves a keyboard reorder with one position update', async () => {
    await mount()
    await keyboardMove()
    await expect.poll(() => patches.length).toBe(1)
    const [patch] = patches
    expect(patch?.id).toBe(rows.find((row) => row.name === 'Discovery')?.id)
    expect(patch?.data).toEqual({ position: 2.5 })
    // Only applies if nobody else moved the stage since it was loaded.
    expect(patch?.url.searchParams.get('filter[position]')).toBe('1')
    await expect
      .poll(listOrder)
      .toEqual(['Evaluation', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'])
  })

  it('saves a pointer drag from the row handle', async () => {
    await mount()
    await page
      .getByRole('button', { name: 'Move Discovery' })
      .dropTo(page.getByRole('listitem', { name: 'Evaluation', exact: true }))
    await expect.poll(() => patches.length).toBe(1)
    await expect
      .poll(listOrder)
      .toEqual(['Evaluation', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost'])
  })

  it('restores the saved order after a rejected drop', async () => {
    await mount()
    worker.use(
      http.patch('/api/crm/items/pipelineStages/:id', () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    )
    await keyboardMove()
    await expect.element(page.getByRole('alert')).toHaveTextContent(appCopy.form.permissionDenied)
    await expect
      .poll(listOrder)
      .toEqual(['Discovery', 'Evaluation', 'Proposal', 'Negotiation', 'Won', 'Lost'])
  })

  it('keeps mobile previews within the viewport and honors field restrictions', async () => {
    await page.viewport(375, 900)
    policies = [
      {
        access: 'rules',
        itemRules: { pipelineStages: { read: {}, update: {} } },
        fieldRules: { pipelineStages: { read: '*', update: { name: {} } } },
      },
    ]
    await mount()
    await expect.element(page.getByRole('button', { name: 'Move Discovery' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add stage' })).toBeNull()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    await page.screenshot()
    await page.getByRole('button', { name: 'Edit Discovery' }).click()
    const dialog = page.getByRole('dialog')
    await expect
      .poll(() => dialog.element().getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(window.innerHeight + 0.5)
    expect(dialog.element().getBoundingClientRect().left).toBe(0)
    expect(dialog.element().getBoundingClientRect().right).toBe(window.innerWidth)
    await page.getByRole('textbox', { name: 'Stage name' }).fill('Qualified')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]?.data).toEqual({ name: 'Qualified' })
  })
})
