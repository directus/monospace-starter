import '@/styles.css'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DataTable, DataTableMobileRow, useDataTable } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'

const columns: Array<DataTableColumn<{ name: string; email: string }>> = [
  { id: 'name', header: 'Name', accessorKey: 'name' },
  { id: 'email', header: 'Email', accessorKey: 'email' },
]

function PersistedTableState() {
  const { table } = useDataTable({
    id: 'persistence-test',
    columns,
    rows: [{ name: 'Example Admin', email: 'admin@example.com' }],
    getRowId: (row) => row.email,
    sort: null,
    onSortChange: vi.fn(),
  })

  return (
    <>
      <output aria-label="name width">{table.state.columnSizing.name ?? 'unset'}</output>
      <output aria-label="column order">{table.state.columnOrder.join(',')}</output>
      <output aria-label="email visibility">
        {String(table.state.columnVisibility.email !== false)}
      </output>
    </>
  )
}

describe('useDataTable layout persistence', () => {
  beforeEach(() => window.localStorage.clear())

  it('restores widths, order, and visibility for every column', () => {
    window.localStorage.setItem(
      'table:persistence-test',
      JSON.stringify({
        sizing: { name: 320, email: 180 },
        order: ['email', 'name'],
        visibility: { email: false },
      }),
    )

    render(<PersistedTableState />)

    expect(screen.getByRole('status', { name: 'name width' })).toHaveTextContent('320')
    expect(screen.getByRole('status', { name: 'column order' })).toHaveTextContent('email,name')
    expect(screen.getByRole('status', { name: 'email visibility' })).toHaveTextContent('false')
  })
})

function PhoneTable() {
  const { table, onDragEnd } = useDataTable({
    id: 'phone-test',
    columns,
    rows: [
      { name: 'Example Admin', email: 'admin@example.com' },
      { name: 'Example Editor', email: 'editor@example.com' },
    ],
    getRowId: (row) => row.email,
    sort: null,
    onSortChange: vi.fn(),
    selectable: true,
  })

  return (
    <DataTable
      table={table}
      onDragEnd={onDragEnd}
      noun="People"
      mobileRow={(row) => (
        <DataTableMobileRow
          render={<a href={`/people/${row.email}`} />}
          title={row.name}
          meta={[row.email]}
        />
      )}
    />
  )
}

describe('DataTable on phones', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders one tappable row per record instead of the grid, without checkboxes', () => {
    render(<PhoneTable />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Example Admin/ })).toHaveAttribute(
      'href',
      '/people/admin@example.com',
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('All 2 people loaded')).toBeInTheDocument()
  })
})
