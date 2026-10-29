import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { ListFilters, FilterTrigger, FilterWell } from '@/components/filters/list-filters'
import { createFilterQuery } from '@/lib/filters'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'

const fields: ListFilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultOperator: 'is_any_of',
    pinSelected: true,
    options: [
      { value: 'active', label: 'Active' },
      { value: 'prospect', label: 'Prospect' },
    ],
  },
  { id: 'name', label: 'Name', type: 'text' },
]

function ExampleFilters() {
  const [query, setQuery] = useState<ListFilterQuery>(createFilterQuery([]))

  return (
    <ListFilters fields={fields} query={query} onQueryChange={setQuery}>
      <FilterTrigger />
      <FilterWell />
    </ListFilters>
  )
}

afterEach(cleanup)

it('searches fields, advances through operators, and keeps multiple options selected', async () => {
  render(<ExampleFilters />)
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await page.getByRole('combobox').fill('stat')
  await expect
    .element(page.getByRole('option', { name: 'Name', exact: true }))
    .not.toBeInTheDocument()
  await page.getByRole('option', { name: 'Status', exact: true }).click()
  await page.getByRole('option', { name: 'is any of', exact: true }).click()
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  await page.getByRole('option', { name: 'Prospect', exact: true }).click()
  await expect
    .element(page.getByRole('option', { name: 'Active', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await expect
    .element(page.getByRole('option', { name: 'Prospect', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await page.getByRole('combobox').fill('active')
  await expect
    .element(page.getByRole('option', { name: 'Prospect', exact: true }))
    .not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('combobox')).not.toBeInTheDocument()
  await expect.element(page.getByRole('button', { name: '2 selected', exact: true })).toHaveFocus()
})

it('keeps keyboard highlight on the same option when selection pins it above other rows', async () => {
  render(<ExampleFilters />)
  await page.getByRole('button', { name: 'Filter', exact: true }).click()
  await userEvent.keyboard('{Home}{Enter}')
  await page.getByRole('option', { name: 'is any of', exact: true }).click()
  await expect.element(page.getByRole('option', { name: 'Prospect', exact: true })).toBeVisible()
  await expect.element(page.getByRole('combobox')).toHaveFocus()
  await userEvent.keyboard('{End}{Enter}')
  await expect
    .element(page.getByRole('option', { name: 'Prospect', exact: true }))
    .toHaveAttribute('aria-selected', 'true')
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByRole('option', { name: 'Prospect', exact: true }))
    .toHaveAttribute('aria-selected', 'false')
  await expect
    .element(page.getByRole('option', { name: 'Active', exact: true }))
    .toHaveAttribute('aria-selected', 'false')
})
