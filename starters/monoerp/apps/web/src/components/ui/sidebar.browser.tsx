import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'

function SidebarStateProbe() {
  const { open, toggleSidebar } = useSidebar()

  return <button onClick={toggleSidebar}>{open ? 'Expanded' : 'Collapsed'}</button>
}

describe('SidebarProvider', () => {
  beforeEach(() => window.localStorage.clear())

  it('restores and persists the desktop sidebar state', async () => {
    window.localStorage.setItem('sidebar-open', 'false')
    const user = userEvent.setup()

    render(
      <SidebarProvider>
        <SidebarStateProbe />
      </SidebarProvider>,
    )

    const toggle = await screen.findByRole('button', { name: 'Collapsed' })
    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Expanded' })).toBeInTheDocument()
    expect(window.localStorage.getItem('sidebar-open')).toBe('true')
  })
})
