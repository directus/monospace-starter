import '@/styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { InlineSelect, InlineText, Property, PropertyList } from '@/components/inline/inline-field'
import { InlineOwner } from '@/components/inline/inline-owner'
import { worker } from '@/test/msw'

const avatar =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="purple"/></svg>'

afterEach(cleanup)

it.each([null, 'profile-photo'])(
  'keeps owner content centered when editing opens (avatar: %s)',
  async (avatarId) => {
    worker.use(
      http.get('/api/system/assets/:id', () =>
        HttpResponse.text(avatar, { headers: { 'content-type': 'image/svg+xml' } }),
      ),
      http.get('/api/crm/members', () => HttpResponse.json({ data: [] })),
    )

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <div className="m-10 w-72 text-sm">
          <InlineOwner
            owner={{
              id: '00000000-0000-4000-8000-000000000001',
              fullName: 'Example Admin',
              email: 'admin@example.com',
              avatarId,
            }}
            onSave={async () => {}}
          />
        </div>
      </QueryClientProvider>,
    )

    const trigger = page.getByRole('button', { name: 'Example Admin' })

    if (avatarId)
      await expect.poll(() => container.querySelector('[data-slot="avatar-image"]')).not.toBeNull()

    const beforeLabel = trigger
      .element()
      .querySelector('span.truncate.text-sm')!
      .getBoundingClientRect()

    const beforeAvatar = trigger
      .element()
      .querySelector('[data-slot="avatar"]')!
      .getBoundingClientRect()

    const row = trigger.element().getBoundingClientRect()
    expect(beforeAvatar.y + beforeAvatar.height / 2).toBe(row.y + row.height / 2)
    expect(beforeLabel.y + beforeLabel.height / 2).toBe(row.y + row.height / 2)
    await trigger.click()
    const editor = container.querySelector('button[aria-haspopup]')!

    if (avatarId)
      await expect.poll(() => editor.querySelector('[data-slot="avatar-image"]')).not.toBeNull()
    const afterLabel = editor.querySelector('span.truncate')!.getBoundingClientRect()
    const afterAvatar = editor.querySelector('[data-slot="avatar"]')!.getBoundingClientRect()
    expect({ x: afterLabel.x, y: afterLabel.y }).toEqual({ x: beforeLabel.x, y: beforeLabel.y })
    expect({ x: afterAvatar.x, y: afterAvatar.y }).toEqual({ x: beforeAvatar.x, y: beforeAvatar.y })
  },
)

it('shows fields the user cannot change as plain text', async () => {
  const saves: Array<string | null> = []

  render(
    <div className="m-10 w-72 text-sm">
      <PropertyList>
        <Property label="Industry" readOnly>
          <InlineText
            label="Industry"
            value="Technology"
            onSave={async (value) => {
              saves.push(value)
            }}
          />
        </Property>
        <Property label="Status" readOnly>
          <InlineSelect
            label="Status"
            value="active"
            options={[{ value: 'active', label: 'Active' }]}
            onSave={async (value) => {
              saves.push(value)
            }}
          />
        </Property>
        <Property label="Domain">
          <InlineText label="Domain" value="example.com" onSave={async () => {}} />
        </Property>
      </PropertyList>
    </div>,
  )

  await expect.element(page.getByText('Technology')).toBeVisible()
  await expect.element(page.getByText('Active')).toBeVisible()
  expect(page.getByRole('button', { name: /Technology/ }).elements()).toHaveLength(0)
  expect(page.getByRole('combobox', { name: 'Status' }).elements()).toHaveLength(0)
  await expect.element(page.getByRole('button', { name: /example\.com/ })).toBeVisible()
  expect(saves).toEqual([])
})
