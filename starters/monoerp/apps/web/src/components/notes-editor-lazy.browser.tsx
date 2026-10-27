import '@/styles.css'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { NotesEditor } from '@/components/notes-editor'

afterEach(cleanup)

it('holds the empty editor height while the editor code loads, so nothing moves', async () => {
  const { container } = render(
    <div style={{ width: 640 }}>
      <NotesEditor value="" onSave={vi.fn().mockResolvedValue(undefined)} />
    </div>,
  )

  const frame = container.firstElementChild?.firstElementChild
  const placeholder = frame?.getBoundingClientRect().height ?? 0

  expect(container.querySelector('.notes-editor')).toBeNull()

  await vi.waitFor(() => expect(container.querySelector('.notes-editor')).not.toBeNull())

  const editor = container.firstElementChild?.firstElementChild?.getBoundingClientRect().height

  expect(Math.abs((editor ?? 0) - placeholder)).toBeLessThanOrEqual(1)
})
