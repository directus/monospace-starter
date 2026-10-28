import '@/styles.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})

for (const theme of ['light', 'dark']) {
  for (const variant of ['default', 'line'] satisfies Array<'default' | 'line'>) {
    it(`uses readable raised or underline tabs in ${theme} (${variant})`, async () => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      render(
        <>
          <div data-testid="raised" className="bg-card text-card-foreground" />
          <Tabs defaultValue="todo">
            <TabsList variant={variant}>
              <TabsTrigger value="todo">
                To do <span className="text-xs text-muted-foreground">3</span>
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
        </>,
      )
      const active = screen.getByRole('tab', { name: 'To do 3' })
      const raised = screen.getByTestId('raised')
      await expect.poll(() => getComputedStyle(active).color).toBe(getComputedStyle(raised).color)
      expect(getComputedStyle(screen.getByText('3')).color).toBe(getComputedStyle(active).color)
      expect(getComputedStyle(active).borderTopColor).toBe('rgba(0, 0, 0, 0)')

      if (variant === 'default') {
        expect(getComputedStyle(active).backgroundColor).toBe(
          getComputedStyle(raised).backgroundColor,
        )
        expect(getComputedStyle(active).backgroundColor).not.toBe(
          getComputedStyle(screen.getByRole('tablist')).backgroundColor,
        )
        expect(getComputedStyle(active).boxShadow).not.toBe('none')
      } else {
        expect(getComputedStyle(active).backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect(getComputedStyle(active, '::after').opacity).toBe('1')
      }
    })
  }
}
