// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { InlineMoney, InlineText } from '@/components/inline/inline-field'

afterEach(cleanup)

describe('InlineMoney', () => {
  it('saves the edited amount with a newly selected currency', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <InlineMoney
        label="Value"
        amount="87500"
        currency="USD"
        currencies={['USD', 'EUR']}
        format={(amount, currency) => `${currency} ${amount}`}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: /USD 87500/i }))
    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('87500')

    await user.click(screen.getByRole('combobox', { name: 'Currency' }))

    expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('87500')
    await user.click(await screen.findByRole('option', { name: 'EUR' }))

    expect(onSave).toHaveBeenCalledWith({ amount: '87500', currency: 'EUR' })
  })

  it('accepts a typed date in an inline editor', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)

    const { container } = render(
      <InlineText
        label="Expected close"
        type="date"
        value="2026-07-15"
        format={(value) => value}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: /2026-07-15/i }))
    const input = container.querySelector('input[type="date"]')
    expect(input).toHaveFocus()

    fireEvent.change(input!, { target: { value: '2026-09-04' } })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-09-04'))
  })
})
