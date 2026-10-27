// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { ActivityRow } from '@/modules/crm/components/activity-row'
import type { ActivityRecord } from '@/modules/crm/data'

const row: ActivityRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  subject: 'Send revised pricing',
  type: 'call',
  status: 'open',
  body: null,
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

afterEach(cleanup)

describe('ActivityRow', () => {
  it('labels compact action buttons with tooltips', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider delay={0}>
          <ActivityRow
            row={row}
            mode="todo"
            onSelect={vi.fn()}
            handlers={{ onOpen: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() }}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    )

    const complete = screen.getByRole('button', { name: 'Mark complete' })
    await user.hover(complete)
    expect(complete).toHaveAttribute('data-popup-open')

    await user.unhover(complete)
    const actions = screen.getByRole('button', { name: 'Actions' })
    await user.hover(actions)
    expect(actions).toHaveAttribute('data-popup-open')
  })
})
