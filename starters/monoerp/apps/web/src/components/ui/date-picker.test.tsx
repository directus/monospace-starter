// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DatePicker } from '@/components/ui/date-picker'

afterEach(cleanup)

describe('DatePicker', () => {
  it('clears a selected date without opening the picker', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value="2026-07-15" onChange={onChange} clearable />)

    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear date' }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('also clears a selected date from inside the picker', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DatePicker value="2026-07-15" onChange={onChange} clearable />)

    await user.click(screen.getByRole('button', { name: 'Open calendar' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('uses a native date input for masked entry and validation', () => {
    const onChange = vi.fn()
    const { container } = render(<DatePicker value="" onChange={onChange} clearable />)
    const input = container.querySelector('input[type="date"]')

    expect(input).toBeInTheDocument()
    fireEvent.change(input!, { target: { value: '2026-09-04' } })

    expect(onChange).toHaveBeenCalledWith('2026-09-04')
  })

  it('offers direct month and year selection', async () => {
    const user = userEvent.setup()
    render(<DatePicker value="2026-07-15" onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open calendar' }))

    expect(screen.getByRole('combobox', { name: /month/i })).toBeVisible()
    expect(screen.getByRole('combobox', { name: /year/i })).toBeVisible()
  })
})
