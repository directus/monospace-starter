import '@/styles.css'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SectionBoundary } from '@/components/data-state'
import { appCopy } from '@/lib/app.copy'

function BrokenPanel(): never {
  throw new Error('Bad portal data')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SectionBoundary', () => {
  it('keeps a crash inside the section', () => {
    // React logs every caught render error; the test expects this one.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <div>
        <p>Organization details</p>
        <SectionBoundary resetKey="org-1">
          <BrokenPanel />
        </SectionBoundary>
      </div>,
    )

    expect(screen.getByText('Organization details')).toBeTruthy()
    expect(screen.getByText(appCopy.data.loadFailedTitle)).toBeTruthy()
    expect(screen.queryByText('Bad portal data')).toBeNull()
    expect(screen.getByText(appCopy.data.loadFailedDescription)).toBeTruthy()
    expect(screen.getByRole('button', { name: appCopy.auth.tryAgain })).toBeTruthy()
  })
})
