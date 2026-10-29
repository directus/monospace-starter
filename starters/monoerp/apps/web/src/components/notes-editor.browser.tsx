import '@/styles.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { NotesEditor } from '@/components/notes-block-editor'

const markdown = `# Account notes

A paragraph with **bold**, *italic*, ~~strikethrough~~, \`inline code\`, and a [link](https://example.com).

## Next steps

- Confirm the scope
  - Ask the delivery team
- [ ] Send the proposal
- [x] Complete discovery

### Decisions

> Keep the rollout small and gather feedback before expanding it.

---

\`\`\`js
const nextStep = 'Send the proposal'
\`\`\`

| Owner | Next step |
| --- | --- |
| Alex | Follow up |
`

function mountNotes(value = markdown) {
  return render(
    <div style={{ maxWidth: 640, margin: '48px auto', padding: 12 }}>
      <div
        data-testid="tokens"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--muted)',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-sans)',
          outlineColor: 'var(--destructive)',
        }}
      />
      <NotesEditor value={value} onSave={vi.fn().mockResolvedValue(undefined)} />
    </div>,
  )
}

function element(selector: string) {
  const result = document.querySelector<HTMLElement>(selector)

  if (!result) throw new Error(`Missing ${selector}`)

  return result
}

afterEach(async () => {
  cleanup()
  document.documentElement.classList.remove('dark')
  await page.viewport(1100, 900)
})

describe('NotesEditor styling', () => {
  it.each(['light', 'dark'])('uses app tokens for content in %s mode', async (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    mountNotes()
    await screen.findByText('Account notes')
    const tokens = getComputedStyle(screen.getByTestId('tokens'))

    expect.soft(getComputedStyle(element('.bn-editor')).fontFamily).toBe(tokens.fontFamily)
    expect.soft(getComputedStyle(element('.bn-editor hr')).borderTopColor).toBe(tokens.borderColor)
    expect(getComputedStyle(element('.bn-editor blockquote')).borderLeftColor).toBe(
      tokens.borderColor,
    )
    expect(getComputedStyle(element('.bn-editor blockquote')).color).toBe(tokens.color)
    expect(getComputedStyle(element('.bn-editor td')).borderTopColor).toBe(tokens.borderColor)
    expect(getComputedStyle(element('[data-content-type="codeBlock"]')).backgroundColor).toBe(
      tokens.backgroundColor,
    )
    expect(getComputedStyle(element('.bn-editor h1')).fontWeight).toBe('600')
    await page.screenshot()
  })

  it.each([
    ['h1', '# First heading'],
    ['h2', '## Second heading'],
    ['h3', '### Third heading'],
    ['paragraph', 'A wrapped paragraph with enough text to fill several lines. '.repeat(5)],
    ['quote', '> A quotation that should align with its controls.'],
    ['divider', '---'],
    ['code', '```\nFirst line\nSecond line\n```'],
    ['table', '| Name | Status |\n| --- | --- |\n| Alex | Open |'],
    ['checklist', '- [ ] Follow up'],
  ])('centers the side menu on the first line of a %s', async (_name, value) => {
    mountNotes(value)
    const content = element('.bn-editor .bn-block-content')
    await page.elementLocator(content).hover({ position: { x: 20, y: 10 } })
    await expect.element(page.getByRole('button', { name: 'Open block menu' })).toBeVisible()

    await expect
      .poll(() => {
        const line = content.querySelector<HTMLElement>('.bn-inline-content, th p, td p, hr')!
        const rect = line.getBoundingClientRect()

        const height = line.matches('hr')
          ? rect.height
          : Number.parseFloat(getComputedStyle(line).lineHeight)

        const menu = element('.bn-side-menu').getBoundingClientRect()

        return Math.abs(menu.top + menu.height / 2 - (rect.top + height / 2))
      })
      .toBeLessThanOrEqual(1)
  })

  it('keeps the toolbar and side controls inside a narrow viewport', async () => {
    await page.viewport(375, 900)
    mountNotes()
    const heading = screen.getByText('Account notes')
    await page.elementLocator(heading).hover()
    await expect.element(page.getByRole('button', { name: 'Open block menu' })).toBeVisible()
    expect(element('.bn-side-menu').getBoundingClientRect().left).toBeGreaterThanOrEqual(12)

    await userEvent.dblClick(heading)
    await expect.element(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible()
    await expect
      .poll(() => getComputedStyle(element('.bn-toolbar').parentElement!).opacity)
      .toBe('1')
    await expect
      .poll(() => element('.bn-toolbar').getBoundingClientRect().left)
      .toBeGreaterThanOrEqual(7)
    await expect
      .poll(() => element('.bn-toolbar').getBoundingClientRect().right)
      .toBeLessThanOrEqual(368)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
    await page.screenshot()
  })

  it.each(['light', 'dark'])(
    'styles portaled menus and preserves editing in %s mode',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      mountNotes('Select this text')
      await userEvent.dblClick(screen.getByText('Select this text'))
      const bold = page.getByRole('button', { name: 'Bold', exact: true })
      await expect.element(bold).toBeVisible()
      await bold.click()
      await expect.element(bold).toHaveAttribute('aria-pressed', 'true')
      await expect
        .poll(() => getComputedStyle(element('.bn-toolbar').parentElement!).opacity)
        .toBe('1')
      expect(
        element('.bn-toolbar').closest('.notes-editor')?.getAttribute('data-color-scheme'),
      ).toBe(theme)
      await page.screenshot()
      await userEvent.keyboard('{Escape}')

      await page.elementLocator(element('.bn-editor .bn-block-content')).hover()
      await page.getByRole('button', { name: 'Open block menu' }).click()
      const remove = page.getByRole('menuitem', { name: 'Delete' })
      await expect.element(remove).toBeVisible()
      expect(getComputedStyle(remove.element()).color).toBe(
        getComputedStyle(screen.getByTestId('tokens')).outlineColor,
      )
      expect(remove.element().closest('.notes-editor')?.getAttribute('data-color-scheme')).toBe(
        theme,
      )
      await page.screenshot()
      await userEvent.keyboard('{Escape}')
    },
  )

  it.each([1, 10])(
    'reorders blocks without opening the delete menu (%i pointer steps)',
    async (steps) => {
      mountNotes('First block\n\nSecond block\n\nThird block')
      await page.getByText('First block', { exact: true }).hover()
      const handle = page.getByRole('button', { name: 'Open block menu' })
      await expect.element(handle).toBeVisible()
      let menuOpened = false

      const observer = new MutationObserver(() => {
        if (screen.queryByRole('menuitem', { name: 'Delete' })) menuOpened = true
      })

      observer.observe(document.body, { childList: true, subtree: true })

      try {
        await handle.dropTo(page.getByText('Third block', { exact: true }), {
          targetPosition: { x: 10, y: 2 },
          steps,
        })
        expect(menuOpened).toBe(false)
        await expect
          .poll(() =>
            [...document.querySelectorAll('.bn-editor p')].flatMap((p) => p.textContent || []),
          )
          .toEqual(['Second block', 'First block', 'Third block'])
        await expect.element(page.getByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()

        await page.getByText('Third block', { exact: true }).hover()
        await handle.click()
        await page.getByRole('menuitem', { name: 'Delete' }).click()
        await expect.element(page.getByText('Third block', { exact: true })).not.toBeInTheDocument()
        await expect.element(page.getByText('First block', { exact: true })).toBeVisible()
      } finally {
        observer.disconnect()
      }
    },
  )

  it('releases the handle after a drag is dropped outside the editor', async () => {
    mountNotes('First block\n\nSecond block')
    await page.getByText('First block', { exact: true }).hover()
    const handle = page.getByRole('button', { name: 'Open block menu' })
    await handle.dropTo(page.elementLocator(document.body), {
      targetPosition: { x: 5, y: 5 },
      steps: 10,
    })
    await expect.element(page.getByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
    await expect.element(page.getByText('First block', { exact: true })).toBeVisible()
    await page.getByText('Second block', { exact: true }).hover()
    await handle.click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect.element(page.getByText('Second block', { exact: true })).not.toBeInTheDocument()
    await expect.element(page.getByText('First block', { exact: true })).toBeVisible()
  })

  it.each(['{Enter}', ' '])('opens the block menu with the %j key', async (key) => {
    mountNotes('Keep keyboard access')
    await page.getByText('Keep keyboard access', { exact: true }).hover()
    const handle = page.getByRole('button', { name: 'Open block menu' })
    await expect.element(handle).toBeVisible()
    handle.element().focus()
    await userEvent.keyboard(key)
    await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('keeps link editing portaled and usable on mobile', async () => {
    await page.viewport(375, 900)
    mountNotes('Link this text')
    await userEvent.dblClick(screen.getByText('Link this text'))
    await page.getByRole('button', { name: 'Create link', exact: true }).click()
    const url = page.getByPlaceholder('Edit URL')
    await expect.element(url).toBeVisible()
    expect(url.element().closest('.notes-editor')).not.toBeNull()
    await url.fill('https://example.com')
    await userEvent.keyboard('{Enter}')
    expect(element('.bn-editor a').getAttribute('href')).toBe('https://example.com')
  })

  it('updates the skin when the document theme changes and aligns after scrolling', async () => {
    mountNotes()
    document.documentElement.classList.add('dark')
    await expect.poll(() => element('.bn-container').dataset.colorScheme).toBe('dark')
    expect(getComputedStyle(element('.bn-editor hr')).borderTopColor).toBe(
      getComputedStyle(screen.getByTestId('tokens')).borderColor,
    )

    const frame = element('.bn-container').parentElement!
    frame.style.height = '180px'
    frame.style.overflow = 'auto'
    const heading = screen.getByText('Decisions')
    await page.elementLocator(heading).hover()
    await expect.element(page.getByRole('button', { name: 'Open block menu' })).toBeVisible()
    expect(frame.scrollTop).toBeGreaterThan(0)
    await expect
      .poll(() => {
        const rect = heading.getBoundingClientRect()
        const menu = element('.bn-side-menu').getBoundingClientRect()

        return Math.abs(menu.top + menu.height / 2 - (rect.top + rect.height / 2))
      })
      .toBeLessThanOrEqual(1)
  })

  it('keeps slash-menu selection, insertion, and checkbox interaction working', async () => {
    mountNotes('')
    await page.getByRole('textbox').click()
    await userEvent.keyboard('/')
    const divider = page.getByRole('option', { name: 'Divider', exact: true })
    await expect.element(divider).toBeVisible()
    expect(divider.element().closest('.notes-editor')).not.toBeNull()
    await expect
      .poll(() => getComputedStyle(element('.bn-suggestion-menu').parentElement!).opacity)
      .toBe('1')
    await page.screenshot()
    await divider.click()
    expect(element('.bn-editor hr')).toBeTruthy()
    cleanup()

    mountNotes('- [ ] Follow up')
    const checkbox = page.getByRole('checkbox')
    await checkbox.click()
    await expect.element(checkbox).toBeChecked()
    expect(element('[data-content-type="checkListItem"]').dataset.checked).toBe('true')
  })
})

it('keeps notes readable without editing or saving when read-only', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<NotesEditor value={'# Account notes\n\nRead this first.'} onSave={save} readOnly />)
  await screen.findByText('Account notes')
  expect(element('.bn-editor').getAttribute('contenteditable')).toBe('false')
  expect(document.querySelector('.bn-side-menu')).toBeNull()
  cleanup()
  expect(save).not.toHaveBeenCalled()
})
