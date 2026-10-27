import '@/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { sessionQuery } from '@/lib/auth'
import { collectionPermissions, collectionPermissionsQuery } from '@/lib/permissions'
import { AttachmentsPanel } from '@/modules/crm/components/files/panel'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { RecordTabs } from '@/modules/crm/components/record-tabs'
import { signedIn, worker } from '@/test/msw'

const id = '00000000-0000-4000-8000-000000000001'

afterEach(cleanup)

describe('read-only record details', () => {
  it('keeps activity and files readable without offering write controls', async () => {
    worker.use(
      ...signedIn,
      http.get('/api/monoerp/system/user-role', () =>
        HttpResponse.json({ data: [{ roleId: 'role' }] }),
      ),
      http.get('/api/monoerp/roles/:id/policies', () =>
        HttpResponse.json({
          data: [
            {
              access: 'rules',
              itemRules: { interactions: { read: {} }, attachments: { read: {} } },
              fieldRules: { interactions: { read: '*' }, attachments: { read: '*' } },
            },
          ].map((content) => ({ content })),
        }),
      ),
      http.get('/api/monoerp/items/attachments', () => HttpResponse.json({ data: [] })),
      http.get('/api/system/info', () => HttpResponse.json({ data: {} })),
    )
    const client = new QueryClient()
    client.setQueryData(sessionQuery().queryKey, {
      id,
      email: 'reader@example.com',
      fullName: 'Reader',
      avatarId: null,
    })

    for (const collection of ['interactions', 'attachments']) {
      client.setQueryData(
        collectionPermissionsQuery(id, collection).queryKey,
        collectionPermissions(
          [
            {
              access: 'rules',
              itemRules: { [collection]: { read: {} } },
              fieldRules: { [collection]: { read: '*' } },
            },
          ],
          collection,
        ),
      )
    }

    render(
      <QueryClientProvider client={client}>
        <RecordTabs
          activity={
            <RecordActivity
              interactions={[]}
              defaults={{ organization: { value: id, label: 'Atlas' } }}
              hide={['organization']}
              emptyMessage="No activity yet"
            />
          }
          notes={<p>Notes</p>}
          files={
            <AttachmentsPanel
              scope={{ organizationId: id }}
              target={{ organizationId: id }}
              hide={['organization']}
              emptyMessage="No files yet"
            />
          }
        />
      </QueryClientProvider>,
    )

    await expect.element(page.getByText('No activity yet')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Log activity' })).not.toBeInTheDocument()
    await page.getByRole('tab', { name: 'To do' }).click()
    await expect
      .element(page.getByPlaceholder('What needs to happen next?'))
      .not.toBeInTheDocument()
    await page.getByRole('tab', { name: 'Files' }).click()
    await expect.element(page.getByText('No files yet')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Upload' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Add link' })).not.toBeInTheDocument()
  })
})
