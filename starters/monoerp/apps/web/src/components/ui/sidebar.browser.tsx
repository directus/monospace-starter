import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { appStorageKey } from '@/lib/storage'

function SidebarStateProbe() {
  const { open, toggleSidebar } = useSidebar()

  return <button onClick={toggleSidebar}>{open ? 'Expanded' : 'Collapsed'}</button>
}

describe('SidebarProvider', () => {
  beforeEach(() => window.localStorage.clear())

  it('restores and persists the desktop sidebar state', async () => {
    window.localStorage.setItem(appStorageKey('sidebar-open'), 'false')
    const user = userEvent.setup()

    render(
      <SidebarProvider>
        <SidebarStateProbe />
      </SidebarProvider>,
    )

    const toggle = await screen.findByRole('button', { name: 'Collapsed' })
    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Expanded' })).toBeInTheDocument()
    expect(window.localStorage.getItem(appStorageKey('sidebar-open'))).toBe('true')
  })
})
