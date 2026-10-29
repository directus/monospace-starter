import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { page, userEvent as browserUserEvent } from 'vitest/browser'

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
  { id: 'name', header: 'Name', kind: 'primary', accessorKey: 'name', size: 320 },
  { id: 'email', header: 'Email', kind: 'email', accessorKey: 'email', size: 520 },
  { id: 'status', header: 'Status', kind: 'badge', accessorKey: 'status', size: 500 },
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

it('fits sort labels on one line and aligns header dividers with resize handles', async () => {
  render(<ExampleTable />)
  await page.getByRole('button', { name: 'Name column options' }).click()

  for (const label of ['Sort ascending', 'Sort descending']) {
    const item = page.getByRole('menuitem', { name: label }).element()
    const text = Array.from(item.childNodes).find((node) => node.textContent === label)

    if (!text) throw new Error(`Missing ${label} text`)
    const range = document.createRange()
    range.selectNodeContents(text)
    expect(range.getClientRects()).toHaveLength(1)
    expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth)
  }

  for (const handle of document.querySelectorAll('[role="separator"][aria-valuenow]')) {
    const header = handle.closest('th')

    if (!header) throw new Error('Missing resize header')
    expect(getComputedStyle(header).borderRightWidth).toBe('1px')
    expect(header.getBoundingClientRect().right - handle.getBoundingClientRect().right).toBe(1)
  }

  const cell = document.querySelector('tbody td')

  if (!cell) throw new Error('Missing body cell')
  expect(getComputedStyle(cell).borderRightWidth).toBe('0px')
  expect(getComputedStyle(page.getByRole('columnheader').first().element()).borderRightColor).toBe(
    getComputedStyle(cell).borderBottomColor,
  )
})

for (const surface of ['header', 'display']) {
  it(`reorders rendered headers and cells through ${surface} pointer drags`, async () => {
    render(<ExampleTable />)
    await expect.element(page.getByText('Record 1', { exact: true })).toBeVisible()

    const firstRow = () => {
      const row = document.querySelector('tbody tr[data-row-id="0"]')

      if (!row) throw new Error('Missing first row')

      return Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    }

    expect(firstRow()).toEqual(['', 'Record 1', 'record-1@example.com', 'Active', ''])

    if (surface === 'display')
      await page.getByRole('button', { name: 'Display', exact: true }).click()
    const email = page.getByRole('button', { name: 'Drag to move email column' }).last()
    const status = page.getByRole('button', { name: 'Drag to move status column' }).last()
    await browserUserEvent.dragAndDrop(email, status)
    await expect
      .element(page.getByRole('status', { name: 'order' }))
      .toHaveTextContent('select,name,status,email')
    await expect.poll(firstRow).toEqual(['', 'Record 1', 'Active', 'record-1@example.com', ''])
    await expect
      .poll(() => Array.from(document.querySelectorAll('thead th')).map((cell) => cell.textContent))
      .toEqual(['', 'Name', 'Status', 'Email', ''])
    // A second drag must update existing rows again, without a reload.
    await browserUserEvent.dragAndDrop(email, status)
    await expect.poll(firstRow).toEqual(['', 'Record 1', 'record-1@example.com', 'Active', ''])

    if (surface === 'header')
      await page.getByRole('button', { name: 'Display', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Email', exact: true }).click()
    await expect.poll(firstRow).toEqual(['', 'Record 1', 'Active', ''])
    await expect.element(page.getByRole('columnheader', { name: /Email/ })).not.toBeInTheDocument()
    await page.getByRole('checkbox', { name: 'Email', exact: true }).click()
    await expect.poll(firstRow).toEqual(['', 'Record 1', 'record-1@example.com', 'Active', ''])
    await userEvent.keyboard('{Escape}')
    const handle = page.getByRole('separator', { name: 'Resize email column' })
    await handle.click()
    await userEvent.keyboard('{ArrowRight}')
    const header = handle.element().closest('th')

    if (!header) throw new Error('Missing email header')
    await expect.poll(() => header.getBoundingClientRect().width).toBe(530)
    const cell = document.querySelector('tbody tr[data-row-id="0"] td:nth-child(3)')

    if (!cell) throw new Error('Missing email cell')
    expect(cell.getBoundingClientRect().width).toBe(530)
  })
}

type DatedRow = { id: string; name: string; note: string; updatedAt: string }

const datedColumns: DataTableColumn<DatedRow>[] = [
  { id: 'name', header: 'Name', kind: 'primary', accessorKey: 'name' },
  {
    id: 'note',
    header: 'A header label far longer than its column',
    kind: 'text',
    accessorKey: 'note',
  },
  {
    id: 'updatedAt',
    header: 'Last updated by anyone',
    kind: 'date',
    accessorKey: 'updatedAt',
    meta: { headerClassName: 'justify-end', cellClassName: 'text-right' },
  },
]

function DatedTable() {
  const { table, onDragEnd } = useDataTable({
    id: 'dated-table',
    columns: datedColumns,
    rows: [{ id: '1', name: 'Record 1', note: 'Note', updatedAt: 'Aug 20, 2026' }],
    getRowId: (row) => row.id,
    sort: null,
    onSortChange: () => {},
    selectable: true,
  })

  return (
    <div className="flex h-[300px] w-[600px] flex-col">
      <DataTable table={table} onDragEnd={onDragEnd} noun="Records" />
    </div>
  )
}

it('truncates header labels inside their column and fits a full date at the minimum width', async () => {
  render(<DatedTable />)
  await expect.element(page.getByText('Aug 20, 2026')).toBeVisible()
  const resize = page.getByRole('separator', { name: 'Resize last updated by anyone column' })
  await resize.click()

  for (let step = 0; step < 10; step++) await userEvent.keyboard('{ArrowLeft}')
  await expect.poll(() => resize.element().getAttribute('aria-valuenow')).toBe('140')

  for (const header of document.querySelectorAll('thead th')) {
    const label = header.querySelector('[title]')

    if (!label) continue
    const bounds = header.getBoundingClientRect()
    const text = (label.querySelector('.truncate') ?? label).getBoundingClientRect()
    expect(text.left).toBeGreaterThanOrEqual(bounds.left)
    expect(text.right).toBeLessThanOrEqual(bounds.right)
    expect(label.getAttribute('title')).toBe(label.textContent)
  }

  const long = page.getByText('A header label far longer than its column').element()
  expect(long.scrollWidth).toBeGreaterThan(long.clientWidth)

  const date = page.getByText('Aug 20, 2026').element()
  expect(date.scrollWidth).toBeLessThanOrEqual(date.clientWidth)

  const header = page
    .getByRole('button', { name: 'Last updated by anyone column options' })
    .element()

  const cellEnd =
    date.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(date).paddingRight)

  // Right-aligned headers end where their cells' text ends, less the header's 1px divider.
  expect(cellEnd - (header.getBoundingClientRect().right - 8)).toBe(1)
})
