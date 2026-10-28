import '@/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { ListTable } from '@/components/data-table/list-table'
import { ListControls } from '@/components/list-controls'
import type { Uuid } from '@/generated/monospace'
import { useListPage } from '@/hooks/use-list-page'
import { createFilterQuery } from '@/lib/filters'
import { pagesQuery } from '@/lib/list-query'
import type { ListSearch } from '@/lib/list-search'
import { uuidSchema } from '@/lib/uuid'

const records: { id: Uuid; name: string }[] = [
  { id: uuidSchema.parse('00000000-0000-4000-8000-000000000001'), name: 'Alice' },
  { id: uuidSchema.parse('00000000-0000-4000-8000-000000000002'), name: 'Bob' },
]

const columns = [{ id: 'name', header: 'Name', kind: 'primary' as const, accessorKey: 'name' }]

function ListExample() {
  const [search, setSearch] = useState<ListSearch>({ view: 'pool' })

  const state = useListPage({
    id: 'list-page-test',
    columns,
    search,
    onSearchChange: (patch) => setSearch((previous) => ({ ...previous, ...patch })),
    params: search,
    query: (params) =>
      pagesQuery(['example', params], async () =>
        records.filter((row) => row.name.toLowerCase().includes(params.q?.toLowerCase() ?? '')),
      ),
    selectable: true,
  })

  return (
    <div className="flex h-[400px] w-[900px] flex-col">
      <ListControls
        state={state}
        fields={[]}
        title="People"
        icon={Users}
        defaultSort={{ id: 'name', desc: false, label: 'Name' }}
      />
      <ListTable {...state.tableProps} query={state.list} noun="People" />
      <output aria-label="url">{JSON.stringify(search)}</output>
      <output aria-label="selection">{state.selectedIds.length}</output>
      <output aria-label="filter count">{state.query.rules.length}</output>
      <button onClick={() => state.setFilters(createFilterQuery([]))}>Clear filters</button>
    </div>
  )
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ListExample />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('keeps the view in URL updates and clears selection when search changes', async () => {
  mount()
  await expect.element(page.getByText('Alice', { exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select row', exact: true }).first().click()
  await expect.element(page.getByRole('status', { name: 'selection' })).toHaveTextContent('1')
  await page.getByPlaceholder('Search this view').fill('Bob')
  await expect.element(page.getByText('Alice', { exact: true })).not.toBeInTheDocument()
  await expect
    .element(page.getByRole('status', { name: 'url' }))
    .toHaveTextContent('"view":"pool","q":"Bob"')
  await expect.element(page.getByRole('status', { name: 'selection' })).toHaveTextContent('0')
  await page.getByRole('button', { name: 'Name column options' }).click()
  await page.getByRole('menuitem', { name: 'Sort descending' }).click()
  await expect
    .element(page.getByRole('status', { name: 'url' }))
    .toHaveTextContent('"sort":"name.desc"')
})
