// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ListToolbar } from '@/components/list-toolbar'

describe('ListToolbar search', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('debounces search changes', async () => {
    vi.useFakeTimers()
    const onQueryChange = vi.fn()
    render(<ListToolbar query="" onQueryChange={onQueryChange} />)

    fireEvent.change(screen.getByPlaceholderText('Search this view'), {
      target: { value: 'acme' },
    })
    expect(onQueryChange).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(299))
    expect(onQueryChange).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(1))
    expect(onQueryChange).toHaveBeenCalledOnce()
    expect(onQueryChange).toHaveBeenCalledWith('acme')
  })

  it('replaces the title with selection actions without hiding page actions', () => {
    const { rerender } = render(
      <ListToolbar
        title="Organizations"
        query=""
        onQueryChange={vi.fn()}
        action={<button type="button">Add organization</button>}
      />,
    )

    expect(screen.getByText('Organizations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add organization' })).toBeInTheDocument()

    rerender(
      <ListToolbar
        title="Organizations"
        query=""
        onQueryChange={vi.fn()}
        selection={<div>2 selected</div>}
        action={<button type="button">Add organization</button>}
      />,
    )

    expect(screen.queryByText('Organizations')).not.toBeInTheDocument()
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add organization' })).toBeInTheDocument()
  })

  it('clears immediately and keeps focus in the search input', async () => {
    const onQueryChange = vi.fn()
    const user = userEvent.setup()
    render(<ListToolbar query="acme" onQueryChange={onQueryChange} />)

    const input = screen.getByPlaceholderText('Search this view')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(onQueryChange).toHaveBeenCalledWith('')
  })
})
