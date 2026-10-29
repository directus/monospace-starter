import '@/styles.css'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenuButton,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
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

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})

for (const theme of ['light', 'dark']) {
  for (const expanded of [true, false]) {
    it(`keeps sidebar focus inside its bounds in ${theme}, expanded: ${expanded}`, async () => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      localStorage.clear()
      const user = userEvent.setup()
      render(
        <SidebarProvider defaultOpen={expanded}>
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <SidebarMenuButton>Workspace</SidebarMenuButton>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel render={<button />}>CRM</SidebarGroupLabel>
                <div className="overflow-hidden">
                  <SidebarMenuButton>Contacts</SidebarMenuButton>
                </div>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>,
      )

      for (const name of expanded ? ['Workspace', 'CRM', 'Contacts'] : ['Workspace', 'Contacts']) {
        await user.tab()
        const element = screen.getByRole('button', { name })
        expect(element).toHaveFocus()
        expect(element.matches(':focus-visible')).toBe(true)
        expect(getComputedStyle(element).boxShadow).toContain('inset')
        expect(getComputedStyle(element).getPropertyValue('--tw-ring-inset')).toBe('inset')
      }

      const content = document.querySelector('[data-slot="sidebar-content"]')

      if (!content) throw new Error('Missing sidebar content')
      expect(getComputedStyle(content).overflow).toBe(expanded ? 'auto' : 'hidden')
    })
  }
}
