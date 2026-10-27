import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'

const owner = {
  value: '00000000-0000-4000-8000-000000000001',
  label: 'Example Admin',
  description: 'admin@example.com',
  avatar: true,
} satisfies RelationOption

function ComboboxHarness({
  id = 'owner',
  label = 'Owner',
  options = [owner],
}: {
  id?: string
  label?: string
  options?: Array<RelationOption>
}) {
  const [value, setValue] = useState<RelationOption | null>(null)
  const [client] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={client}>
      <label htmlFor={id}>{label}</label>
      <RelationCombobox
        id={id}
        value={value}
        onChange={setValue}
        search={() => Promise.resolve(options)}
        placeholder={`Set ${label.toLowerCase()}`}
      />
    </QueryClientProvider>
  )
}

describe('RelationCombobox', () => {
  it('shows an owner avatar in results and preserves it in the selected value', async () => {
    const user = userEvent.setup()
    render(<ComboboxHarness />)

    await user.click(screen.getByRole('combobox', { name: 'Owner' }))
    const option = await screen.findByRole('option', { name: /Example Admin/i })
    expect(option).toHaveTextContent('EA')

    await user.click(option)

    const trigger = screen.getByRole('combobox', { name: 'Owner' })
    expect(trigger).toHaveTextContent('EA')
  })

  it('shows contact initials and square organization logos', async () => {
    const user = userEvent.setup()

    const options = [
      { value: '00000000-0000-4000-8000-000000000002', label: 'Maya Patel', variant: 'circle' },
      {
        value: '00000000-0000-4000-8000-000000000003',
        label: 'Apple',
        image: '/logo/apple.com',
        variant: 'square',
      },
    ] satisfies Array<RelationOption>

    render(<ComboboxHarness id="record" label="Record" options={options} />)

    await user.click(screen.getByRole('combobox', { name: 'Record' }))
    expect(await screen.findByRole('option', { name: /Maya Patel/i })).toHaveTextContent('MP')

    const organization = screen.getByRole('option', { name: /Apple/i })
    expect(organization.querySelector('[data-slot="avatar"]')).toHaveClass('rounded-md')

    await user.click(organization)
    expect(
      screen.getByRole('combobox', { name: 'Record' }).querySelector('[data-slot="avatar"]'),
    ).toHaveClass('rounded-md')
  })
})
