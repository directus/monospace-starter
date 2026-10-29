import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { Cascader } from '@/components/filters/cascader'

const items = Array.from({ length: 500 }, (_, index) => ({
  value: `option-${index}`,
  label: `Option ${String(index).padStart(3, '0')}`,
  description: index % 7 === 0 ? 'Extra details' : undefined,
  divider: index % 50 === 0,
  disabled: index === 0 || index === 499,
}))

function Example() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  return (
    <div className="w-72">
      <Cascader
        items={items}
        label="Options"
        query={query}
        onQueryChange={setQuery}
        selected={selected}
        onSelect={(value) => setSelected([value])}
      />
      <output aria-label="chosen">{selected.join(',')}</output>
    </div>
  )
}

afterEach(cleanup)

it('virtualizes 500 mixed-height options while preserving active descendants and keyboard navigation', async () => {
  render(<Example />)
  const input = page.getByRole('combobox', { name: 'Options' })
  const list = page.getByRole('listbox', { name: 'Options' })

  const active = () =>
    document.getElementById(input.element().getAttribute('aria-activedescendant') ?? '')

  const activeInside = () => {
    const option = active()?.getBoundingClientRect()
    const viewport = list.element().getBoundingClientRect()

    return Boolean(option && option.top >= viewport.top - 1 && option.bottom <= viewport.bottom + 1)
  }

  await expect.element(input).toHaveFocus()
  await expect.poll(() => document.querySelectorAll('[role="option"]').length).toBeLessThan(40)
  await userEvent.keyboard('{End}')
  await expect.poll(() => active()?.textContent).toContain('Option 498')
  await expect.poll(activeInside).toBe(true)
  expect(active()?.getAttribute('aria-posinset')).toBe('499')
  expect(active()?.getAttribute('aria-setsize')).toBe('500')
  expect(document.querySelectorAll('[role="option"]').length).toBeLessThan(40)
  await page.screenshot()

  list.element().scrollTop = 0
  await expect.element(page.getByRole('option', { name: 'Option 001', exact: true })).toBeVisible()
  expect(active()).not.toBeNull()
  expect(active()?.textContent).toContain('Option 498')
  expect(document.querySelectorAll('[role="option"]').length).toBeLessThan(40)
  await userEvent.keyboard('{ArrowUp}')
  await expect.poll(() => active()?.textContent).toContain('Option 497')
  await expect.poll(activeInside).toBe(true)
  await userEvent.keyboard('{Home}{Enter}')
  await expect.element(page.getByRole('status', { name: 'chosen' })).toHaveTextContent('option-1')
  await expect.poll(activeInside).toBe(true)
  await userEvent.keyboard('{End}{Enter}')
  await expect.element(page.getByRole('status', { name: 'chosen' })).toHaveTextContent('option-498')
  await expect.poll(activeInside).toBe(true)

  await input.fill('Option 240')
  await expect.element(page.getByRole('option', { name: 'Option 240', exact: true })).toBeVisible()
  expect(document.querySelectorAll('[role="option"]').length).toBe(1)
  expect(active()?.textContent).toContain('Option 240')
  expect(active()?.getAttribute('aria-setsize')).toBe('1')
  await expect.element(input).toHaveFocus()
})
