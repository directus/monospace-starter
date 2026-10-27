import '@/styles.css'

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { ListToolbar } from '@/components/list-toolbar'
import { appCopy } from '@/lib/app.copy'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('syncs external queries and clears a pending search without changing an uncontrolled default', async () => {
  const errors = vi.spyOn(console, 'error')
  const onQueryChange = vi.fn()
  const { rerender } = render(<ListToolbar query="first" onQueryChange={onQueryChange} />)
  const input = page.getByPlaceholder(appCopy.list.searchPlaceholder)
  await input.fill('pending')
  await expect.element(input).toHaveValue('pending')
  rerender(<ListToolbar query="shared" onQueryChange={onQueryChange} />)
  await expect.element(input).toHaveValue('shared')
  await page.getByRole('button', { name: appCopy.search.clear, exact: true }).click()
  await expect.element(input).toHaveValue('')
  await expect.element(input).toHaveFocus()
  expect(onQueryChange).toHaveBeenCalledExactlyOnceWith('')
  await input.fill('next')
  await expect.element(input).toHaveValue('next')
  await expect.poll(() => onQueryChange.mock.calls).toEqual([[''], ['next']])
  expect(errors).not.toHaveBeenCalled()
})
