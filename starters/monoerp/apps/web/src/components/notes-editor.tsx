import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import { SideMenuExtension, filterSuggestionItems } from '@blocknote/core/extensions'
import { en } from '@blocknote/core/locales'
import {
  AddBlockButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  CreateLinkButton,
  DragHandleButton,
  DragHandleMenu,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  UnnestBlockButton,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  useExtension,
} from '@blocknote/react'
import type { DefaultReactSuggestionItem } from '@blocknote/react'
import { BlockNoteView, ShadCNDefaultComponents } from '@blocknote/shadcn'
import { flip, offset, shift } from '@floating-ui/react'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

const copy = appCopy.notes

const SAVE_DELAY = 1000

const SAVED_FLASH = 2000

const { DropdownMenuTrigger } = ShadCNDefaultComponents.DropdownMenu

const notesShadCNComponents = {
  DropdownMenu: {
    ...ShadCNDefaultComponents.DropdownMenu,
    DropdownMenuTrigger: NotesMenuTrigger,
  },
}

function NotesMenuTrigger({
  onPointerDown,
  onMouseDown,
  ...props
}: Parameters<typeof DropdownMenuTrigger>[0]) {
  const sideMenu = useExtension(SideMenuExtension)
  const cleanupPress = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => cleanupPress.current?.(), [])

  function pinHandle(button: HTMLButtonElement) {
    cleanupPress.current?.()
    sideMenu.freezeMenu()
    const controller = new AbortController()
    const options = { signal: controller.signal }
    const doc = button.ownerDocument
    let dragging = false
    let frame = 0

    const release = () => {
      controller.abort()
      // Click opens the menu after pointerup. Keep its anchor frozen in that case.
      frame = requestAnimationFrame(() => {
        if (button.getAttribute('aria-expanded') !== 'true') sideMenu.unfreezeMenu()
      })
    }

    doc.addEventListener(
      'dragstart',
      () => {
        dragging = true
      },
      options,
    )
    doc.addEventListener('pointerup', release, options)
    doc.addEventListener('dragend', release, options)
    doc.addEventListener(
      'pointercancel',
      () => {
        if (!dragging) release()
      },
      options,
    )
    doc.defaultView?.addEventListener('blur', release, options)
    cleanupPress.current = () => {
      controller.abort()
      cancelAnimationFrame(frame)
    }
  }

  return (
    <DropdownMenuTrigger
      {...props}
      onPointerDown={(event) => {
        onPointerDown?.(event)

        // Skip press-to-open for drag handles without cancelling native drag events.
        if (event.currentTarget.draggable) {
          event.preventBaseUIHandler()

          if (event.button === 0 && event.currentTarget.closest('.bn-side-menu')) {
            pinHandle(event.currentTarget)
          }
        }
      }}
      onMouseDown={(event) => {
        onMouseDown?.(event)

        if (event.currentTarget.draggable) event.preventBaseUIHandler()
      }}
    />
  )
}

const sideMenuMiddleware = [
  offset(({ elements, rects }) => {
    const reference = elements.reference

    const referenceElement =
      reference instanceof Element
        ? reference
        : reference.contextElement instanceof Element
          ? reference.contextElement
          : null

    if (!referenceElement) return { crossAxis: 0 }

    const content = referenceElement.querySelector<HTMLElement>('.bn-block-content')
    const line = content?.querySelector<HTMLElement>('.bn-inline-content, th p, td p, hr')

    if (!line) return { crossAxis: 0 }

    // Use the first line, not the whole block, so wrapped text stays aligned.
    const lineRect = line.getBoundingClientRect()

    const lineHeight = line.matches('hr')
      ? lineRect.height
      : Number.parseFloat(getComputedStyle(line).lineHeight)

    return {
      crossAxis:
        lineRect.top -
        reference.getBoundingClientRect().top +
        lineHeight / 2 -
        rects.floating.height / 2,
    }
  }),
]

type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

// Text blocks only: no media, emoji, or deep headings, no toggle variants, and no shortcut badges or
// subtitles so the menu reads as a short single-line list.
const hiddenGroups = new Set([
  en.slash_menu.heading_4.group,
  en.slash_menu.image.group,
  en.slash_menu.emoji.group,
])

function slashItems<B extends BlockSchema, I extends InlineContentSchema, S extends StyleSchema>(
  editor: BlockNoteEditor<B, I, S>,
): Array<DefaultReactSuggestionItem> {
  return getDefaultReactSlashMenuItems(editor)
    .filter((item) => !hiddenGroups.has(item.group ?? '') && !/toggle/i.test(item.title))
    .map((item) => ({ ...item, badge: undefined, subtext: undefined, size: 'small' }))
}

// Block editor over a markdown column. The stored markdown is parsed once on mount; after
// that the editor owns the draft and writes (lossy) markdown back a second after the last
// edit, on blur, and on unmount. Refetches never reset what the user is typing.
export function NotesEditor({
  value,
  onSave,
  className,
}: {
  value: string | null | undefined
  onSave: (markdown: string | null) => Promise<void>
  className?: string
}) {
  const editor = useCreateBlockNote({
    domAttributes: { editor: { class: 'notes-content' } },
    dictionary: {
      ...en,
      placeholders: {
        ...en.placeholders,
        default: copy.blockPlaceholder,
        emptyDocument: copy.placeholder,
      },
    },
  })

  const theme = useDocumentTheme()
  const [status, setStatus] = useState<Status>('idle')
  const initial = useRef((value ?? '').trim())
  const lastSaved = useRef((value ?? '').trim())
  const loaded = useRef(false)
  const dirty = useRef(false)
  const timer = useRef<number>(undefined)

  const save = async () => {
    window.clearTimeout(timer.current)
    const markdown = editor.blocksToMarkdownLossy(editor.document).trim()
    dirty.current = false

    if (markdown === lastSaved.current) {
      setStatus((current) => (current === 'dirty' ? 'idle' : current))

      return
    }

    setStatus('saving')

    try {
      await onSave(markdown || null)
      lastSaved.current = markdown
      setStatus('saved')
      window.setTimeout(
        () => setStatus((current) => (current === 'saved' ? 'idle' : current)),
        SAVED_FLASH,
      )
    } catch {
      dirty.current = true
      setStatus('error')
    }
  }

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  useEffect(() => {
    const blocks = editor.tryParseMarkdownToBlocks(initial.current)

    if (blocks.length) editor.replaceBlocks(editor.document, blocks)
    loaded.current = true

    return () => {
      window.clearTimeout(timer.current)

      if (dirty.current) void saveRef.current()
    }
  }, [editor])

  const handleChange = () => {
    if (!loaded.current) return
    dirty.current = true
    setStatus('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void saveRef.current(), SAVE_DELAY)
  }

  return (
    <div className={cn('relative rounded-xl border bg-card', className)}>
      <SaveStatus status={status} />
      <BlockNoteView
        editor={editor}
        shadCNComponents={notesShadCNComponents}
        theme={theme}
        onChange={handleChange}
        onBlur={() => {
          if (dirty.current) void save()
        }}
        slashMenu={false}
        formattingToolbar={false}
        sideMenu={false}
        className="notes-editor"
      >
        <FormattingToolbarController
          formattingToolbar={NotesToolbar}
          floatingUIOptions={{
            useFloatingOptions: {
              middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
            },
          }}
        />
        <SideMenuController
          sideMenu={NotesSideMenu}
          floatingUIOptions={{ useFloatingOptions: { middleware: sideMenuMiddleware } }}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={(query) => Promise.resolve(filterSuggestionItems(slashItems(editor), query))}
        />
      </BlockNoteView>
    </div>
  )
}

// Block type, inline styles, link, and nesting. No alignment or colors: they do not survive
// the markdown round trip.
function NotesToolbar() {
  return (
    <FormattingToolbar>
      <BlockTypeSelect key="type" />
      <BasicTextStyleButton basicTextStyle="bold" key="bold" />
      <BasicTextStyleButton basicTextStyle="italic" key="italic" />
      <BasicTextStyleButton basicTextStyle="strike" key="strike" />
      <BasicTextStyleButton basicTextStyle="code" key="code" />
      <CreateLinkButton key="link" />
      <NestBlockButton key="nest" />
      <UnnestBlockButton key="unnest" />
    </FormattingToolbar>
  )
}

// Add and drag handle, with the handle's menu cut to Delete (block colors do not survive
// markdown). Styled like every other destructive menu item in the app.
function NotesSideMenu(props: Parameters<typeof SideMenu>[0]) {
  return (
    <SideMenu {...props}>
      <AddBlockButton />
      <DragHandleButton {...props} dragHandleMenu={NotesDragMenu} />
    </SideMenu>
  )
}

function NotesDragMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>
        <Trash2 className="size-4" />
        {appCopy.common.delete}
      </RemoveBlockItem>
    </DragHandleMenu>
  )
}

function SaveStatus({ status }: { status: Status }) {
  if (status === 'idle' || status === 'dirty') return null

  return (
    <span
      role="status"
      className={cn(
        'pointer-events-none absolute top-2 right-3 inline-flex items-center gap-1 text-xs max-sm:top-auto max-sm:bottom-2',
        status === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {status === 'saving' ? <Loader2 className="size-3 animate-spin" /> : null}
      {status === 'saving' ? copy.saving : status === 'saved' ? copy.saved : copy.saveFailed}
    </span>
  )
}

// The app toggles `dark` on <html>; BlockNote would otherwise follow the OS preference.
function useDocumentTheme() {
  const read = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  return theme
}
