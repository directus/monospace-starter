// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useTable } from '@tanstack/react-table'
import { describe, expect, it, vi } from 'vitest'

import { DisplayMenu } from '@/components/display-menu'
import { dataGridFeatures } from '@/components/reui/data-grid/data-grid'

const columns = [
  {
    id: 'select',
    header: 'Select',
    accessorKey: 'selected',
    enableHiding: false,
    enableSorting: false,
  },
  { id: 'organization', header: 'Organization', accessorKey: 'organization' },
  { id: 'email', header: 'Email', accessorKey: 'email' },
]

function DisplayMenuHarness() {
  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: [{ organization: 'Acme', email: 'admin@example.com', selected: false }],
    initialState: {
      columnOrder: ['select', 'organization', 'email'],
      columnPinning: { start: ['select', 'organization'], end: [] },
    },
  })

  return (
    <DisplayMenu
      sort={null}
      defaultSort={{ id: 'organization', desc: false, label: 'Organization' }}
      onSortChange={vi.fn()}
      table={table}
      isDefaultLayout
      onResetColumns={vi.fn()}
    />
  )
}

describe('DisplayMenu', () => {
  it('shows only configurable columns and updates visibility immediately', async () => {
    const user = userEvent.setup()
    render(<DisplayMenuHarness />)

    await user.click(screen.getByRole('button', { name: /display/i }))
    const email = await screen.findByRole('checkbox', { name: 'Email' })

    expect(screen.queryByRole('checkbox', { name: 'Select' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Organization' })).not.toBeInTheDocument()
    expect(email).toBeChecked()
    await user.click(email)
    expect(email).not.toBeChecked()
  })
})
