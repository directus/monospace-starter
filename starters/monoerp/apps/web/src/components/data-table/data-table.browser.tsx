import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { DataTable, useDataTable } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import { DisplayMenu } from '@/components/data-table/display-menu'

type RecordRow = { id: string; name: string; email: string; status: string }

const records: RecordRow[] = Array.from({ length: 120 }, (_, index) => ({
  id: String(index),
  name: `Record ${index + 1}`,
  email: `record-${index + 1}@example.com`,
  status: 'Active',
}))

const columns: DataTableColumn<RecordRow>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', size: 320 },
  { id: 'email', header: 'Email', accessorKey: 'email', size: 520 },
  { id: 'status', header: 'Status', accessorKey: 'status', size: 500 },
]

function ExampleTable() {
  const [count, setCount] = useState(60)
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(null)

  const { table, onDragEnd, resetLayout, isDefaultLayout } = useDataTable({
    id: 'browser-table',
    columns,
    rows: records.slice(0, count),
    getRowId: (row) => row.id,
    sort,
    onSortChange: setSort,
    selectable: true,
  })

  return (
    <div className="flex h-[400px] w-[900px] flex-col">
      <DisplayMenu
        sort={sort}
        onSortChange={setSort}
        defaultSort={{ id: 'name', label: 'Name', desc: false }}
        table={table}
        onResetColumns={resetLayout}
        isDefaultLayout={isDefaultLayout}
      />
      <DataTable
        table={table}
        onDragEnd={onDragEnd}
        noun="Records"
        hasMore={count < 120}
        onLoadMore={() => setCount(120)}
      />
      <output aria-label="order">{table.state.columnOrder.join(',')}</output>
      <output aria-label="email width">{table.state.columnSizing.email ?? 520}</output>
    </div>
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('virtualizes rows, pages at the end, and keeps the name column pinned', async () => {
  render(<ExampleTable />)
  await expect.element(page.getByText('Record 1', { exact: true })).toBeVisible()
  const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')

  if (!viewport) throw new Error('Missing table scroller')
  const pinned = document.querySelector<HTMLElement>('tbody td[data-pinned="start"]:nth-child(2)')

  if (!pinned) throw new Error('Missing pinned name column')
  const left = pinned.getBoundingClientRect().left
  viewport.scrollLeft = 400
  await expect.poll(() => pinned.getBoundingClientRect().left).toBeCloseTo(left, 0)
  viewport.scrollTop = 3000
  await expect.element(page.getByText('All 120 records loaded')).toBeVisible()
  viewport.scrollTop = 10000
  await expect.element(page.getByText('Record 120', { exact: true })).toBeVisible()
  expect(document.querySelectorAll('tbody tr[data-row-id]').length).toBeLessThan(40)
})

it('resizes with the keyboard and reorders through both drag handles', async () => {
  render(<ExampleTable />)
  await page.getByRole('separator', { name: 'Resize email column' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(page.getByRole('status', { name: 'email width' })).toHaveTextContent('530')
  const headerHandle = page.getByRole('button', { name: 'Drag to move email column' })
  headerHandle.element().focus()
  await userEvent.keyboard(' {ArrowRight} ')
  await expect
    .element(page.getByRole('status', { name: 'order' }))
    .toHaveTextContent('select,name,status,email')
  await page.getByRole('button', { name: 'Display', exact: true }).click()
  const menuHandle = page.getByRole('button', { name: 'Drag to move email column' }).last()
  menuHandle.element().focus()
  await userEvent.keyboard(' {ArrowUp} ')
  await expect
    .element(page.getByRole('status', { name: 'order' }))
    .toHaveTextContent('select,name,email,status')
  await page.getByRole('checkbox', { name: 'Email', exact: true }).click()
  await expect.element(page.getByRole('columnheader', { name: /Email/ })).not.toBeInTheDocument()
})

it('aligns selection and headers with compact 49px rows', async () => {
  render(<ExampleTable />)
  await expect.element(page.getByText('Record 1', { exact: true })).toBeVisible()
  const header = page.getByRole('checkbox', { name: 'Select all', exact: true }).element()
  const row = page.getByRole('checkbox', { name: 'Select row', exact: true }).first().element()

  const center = (element: Element) => {
    const rect = element.getBoundingClientRect()

    return rect.left + rect.width / 2
  }

  expect(center(header)).toBeCloseTo(center(row), 0)
  expect(header.closest('th')?.getAttribute('aria-disabled')).toBeNull()
  expect(row.closest('tr')?.getBoundingClientRect().height).toBe(49)
  const name = page.getByText('Record 1', { exact: true }).element().getBoundingClientRect()

  const nameHeader = page
    .getByRole('button', { name: 'Name column options', exact: true })
    .element()

  expect(nameHeader.getBoundingClientRect().left + 8).toBeCloseTo(name.left + 12, 0)
  await page.getByRole('checkbox', { name: 'Select all', exact: true }).click()
  await expect
    .element(page.getByRole('checkbox', { name: 'Select row', exact: true }).first())
    .toBeChecked()
})
