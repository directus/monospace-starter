import '@/styles.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const description = 'Only changed fields will be applied to the selected records. '.repeat(8).trim()

function ExampleDrawer({ withForm = true, withFooter = true, title = 'Edit records' }) {
  const [open, setOpen] = useState(true)

  const content = (
    <>
      <DrawerFormBody>
        {Array.from({ length: 12 }, (_, index) => (
          <label key={index} className="block space-y-2">
            <span>Field {index + 1}</span>
            <Input aria-label={`Field ${index + 1}`} />
          </label>
        ))}
      </DrawerFormBody>
      {withFooter ? (
        <DrawerFormFooter onCancel={() => setOpen(false)}>
          <Button type="submit">Save</Button>
        </DrawerFormFooter>
      ) : null}
    </>
  )

  return (
    <FormDrawer open={open} onOpenChange={setOpen} title={title} description={description}>
      {withForm ? <DrawerForm form={{ handleSubmit: vi.fn() }}>{content}</DrawerForm> : content}
    </FormDrawer>
  )
}

function scrollParent(element: HTMLElement): HTMLElement {
  const parent = element.parentElement

  if (!parent) throw new Error('No scrollable parent')

  return getComputedStyle(parent).overflowY === 'auto' ? parent : scrollParent(parent)
}

async function openedDrawer() {
  const dialog = page.getByRole('dialog')
  await expect.element(dialog).toBeVisible()

  if (window.innerWidth < 768) {
    await expect
      .poll(() => dialog.element().getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(window.innerHeight + 0.5)
    const rect = dialog.element().getBoundingClientRect()
    expect(rect.left).toBe(0)
    expect(rect.right).toBe(window.innerWidth)
    expect(rect.bottom).toBeCloseTo(window.innerHeight, 0)
  } else {
    await expect
      .poll(() => dialog.element().getBoundingClientRect().right)
      .toBeLessThanOrEqual(window.innerWidth - 7.5)
  }

  return dialog.element()
}

afterEach(async () => {
  cleanup()
  await page.viewport(1100, 900)
})

describe('Drawer layout', () => {
  it('keeps the footer plain inside the rounded drawer', async () => {
    render(<ExampleDrawer />)
    const dialog = await openedDrawer()
    const rect = dialog.getBoundingClientRect()
    const styles = getComputedStyle(dialog)
    const footer = screen.getByRole('button', { name: 'Save' }).closest('footer')!
    expect(getComputedStyle(footer).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(footer).borderTopWidth).toBe('0px')
    expect(parseFloat(styles.borderBottomLeftRadius)).toBeGreaterThan(0)
    expect(styles.borderBottomRightRadius).toBe(styles.borderBottomLeftRadius)

    for (const x of [rect.left + 2, rect.right - 2]) {
      expect(dialog.contains(document.elementFromPoint(x, rect.bottom - 2))).toBe(false)
    }
  })

  it.each([
    { width: 1100, height: 420, withForm: true, withFooter: true },
    { width: 375, height: 360, withForm: true, withFooter: true },
    { width: 667, height: 320, withForm: false, withFooter: true },
    { width: 375, height: 360, withForm: false, withFooter: false },
  ])(
    'scrolls descriptions with content at $width × $height (form: $withForm, footer: $withFooter)',
    async ({ width, height, withForm, withFooter }) => {
      await page.viewport(width, height)
      render(<ExampleDrawer withForm={withForm} withFooter={withFooter} />)
      const dialog = await openedDrawer()
      const body = scrollParent(screen.getByRole('textbox', { name: 'Field 1' }))
      const help = screen.getByText(description)
      const heading = screen.getByRole('heading', { name: 'Edit records' })
      expect(body.contains(help)).toBe(true)
      expect(dialog.getAttribute('aria-describedby')).toBe(help.id)
      expect(body.clientHeight).toBeGreaterThan(height * 0.5)
      const headingTop = heading.getBoundingClientRect().top
      const descriptionTop = help.getBoundingClientRect().top

      const footer = withFooter
        ? screen.getByRole('button', { name: 'Save' }).closest('footer')!
        : null

      const footerTop = footer?.getBoundingClientRect().top

      await page
        .getByRole('textbox', { name: 'Field 12', exact: true })
        .fill('Last field is reachable')
      expect(body.scrollTop).toBeGreaterThan(0)
      body.scrollTop = body.scrollHeight
      expect(
        screen.getByRole('textbox', { name: 'Field 12' }).getBoundingClientRect().bottom,
      ).toBeLessThan(body.getBoundingClientRect().bottom)
      expect(help.getBoundingClientRect().top).toBeLessThan(descriptionTop - 100)
      expect(heading.getBoundingClientRect().top).toBeCloseTo(headingTop, 0)

      if (footer) expect(footer.getBoundingClientRect().top).toBeCloseTo(footerTop!, 0)
      expect(dialog.scrollHeight).toBeLessThanOrEqual(dialog.clientHeight)
      await page.screenshot()
      await page.getByRole('button', { name: withFooter ? 'Cancel' : /Close/ }).click()
      await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('keeps long titles from consuming a short drawer', async () => {
    await page.viewport(375, 360)

    const title =
      'Follow up about the implementation details and next steps for the upcoming renewal '
        .repeat(4)
        .trim()

    render(<ExampleDrawer title={title} />)
    await openedDrawer()
    const heading = screen.getByRole('heading', { name: title })
    expect(heading.getBoundingClientRect().height).toBeLessThanOrEqual(
      parseFloat(getComputedStyle(heading).lineHeight) * 2,
    )
    expect(
      scrollParent(screen.getByRole('textbox', { name: 'Field 1' })).clientHeight,
    ).toBeGreaterThan(180)
  })
})
