// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { CheckboxCard } from '@/components/form/checkbox-card'

afterEach(cleanup)

function Harness() {
  const [checked, setChecked] = useState(false)

  return (
    <CheckboxCard
      id="primary"
      checked={checked}
      onCheckedChange={setChecked}
      label="Primary organization"
      description="Use this organization as the contact's main affiliation."
    />
  )
}

describe('CheckboxCard', () => {
  it('toggles from anywhere on the card', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const checkbox = screen.getByRole('checkbox', { name: 'Primary organization' })
    expect(checkbox).not.toBeChecked()

    await user.click(screen.getByText("Use this organization as the contact's main affiliation."))
    expect(checkbox).toBeChecked()
    expect(
      screen.getByText('Primary organization').closest('[data-slot="checkbox-card"]'),
    ).toHaveAttribute('data-checked', 'true')
  })
})
