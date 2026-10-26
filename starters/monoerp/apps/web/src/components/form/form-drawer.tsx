import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

const widths = { md: 'max-w-lg', lg: 'max-w-xl' } as const

const DrawerDescriptionContext = createContext<string | undefined>(undefined)

// Forms slide in from the right on desktop and up from the bottom on mobile.
export function FormDrawer({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  size = 'md',
  actions,
  showCloseButton = true,
  autoHeight = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: ReactElement
  title: string
  description?: string
  size?: keyof typeof widths
  // Extra header controls (a record menu, say), placed before the close button.
  actions?: ReactNode
  showCloseButton?: boolean
  // Phone only: size the sheet to its content instead of filling the screen.
  autoHeight?: boolean
  children: ReactNode
}) {
  const isMobile = useIsMobile()

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      swipeDirection={isMobile ? 'down' : 'right'}
    >
      {trigger ? <Drawer.Trigger render={trigger} /> : null}
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/15 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50">
            <Drawer.Popup
              data-side={isMobile ? 'bottom' : 'right'}
              className={cn(
                'pointer-events-auto fixed flex touch-pan-y flex-col overflow-hidden border bg-background shadow-xl transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform data-swiping:select-none motion-reduce:transition-none [&[data-swiping]]:transition-none',
                isMobile
                  ? 'absolute inset-x-0 bottom-(--drawer-keyboard-inset,0px) w-full translate-y-[var(--drawer-swipe-movement-y)] rounded-t-2xl pb-[env(safe-area-inset-bottom)] data-ending-style:translate-y-full data-starting-style:translate-y-full'
                  : 'inset-y-4 right-4 w-[calc(100%-2rem)] translate-x-[var(--drawer-swipe-movement-x)] rounded-xl data-ending-style:translate-x-[calc(100%+1rem)] data-starting-style:translate-x-[calc(100%+1rem)]',
                isMobile &&
                  (autoHeight
                    ? 'max-h-[calc(100%-1rem-var(--drawer-keyboard-inset,0px))]'
                    : 'h-[calc(100%-1rem-var(--drawer-keyboard-inset,0px))]'),
                !isMobile && widths[size],
              )}
            >
              <div
                aria-hidden="true"
                className={
                  isMobile
                    ? 'flex h-4 shrink-0 touch-none items-center justify-center before:h-1 before:w-10 before:rounded-full before:bg-border'
                    : 'absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize touch-pan-y before:absolute before:top-1/2 before:left-1 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-border/70 before:transition-colors hover:before:bg-muted-foreground/50'
                }
              />
              {/* Outside Drawer.Content on purpose: Content reserves mouse drags for text
                selection, so the header is where a pointer can grab and slide it closed. */}
              <header className="flex shrink-0 cursor-grab items-center gap-4 border-b px-5 py-3 select-none active:cursor-grabbing">
                <Drawer.Title
                  className="line-clamp-2 min-w-0 flex-1 font-semibold break-words"
                  title={title}
                >
                  {title}
                </Drawer.Title>
                {actions}
                {showCloseButton ? (
                  <Drawer.Close render={<Button variant="ghost" size="icon-sm" />}>
                    <X />
                    <span className="sr-only">{appCopy.form.closeDrawer}</span>
                  </Drawer.Close>
                ) : null}
              </header>
              <Drawer.Content className="flex min-h-0 flex-1 flex-col">
                <DrawerDescriptionContext.Provider value={description}>
                  {children}
                </DrawerDescriptionContext.Provider>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  )
}

export function DrawerForm({
  form,
  children,
}: {
  form: { handleSubmit: () => Promise<void> | void }
  children: ReactNode
}) {
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {children}
    </form>
  )
}

export function DrawerFormBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const description = useContext(DrawerDescriptionContext)

  return (
    <div
      className={cn('min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain p-5', className)}
    >
      {description ? (
        <Drawer.Description className="text-sm text-muted-foreground">
          {description}
        </Drawer.Description>
      ) : null}
      {children}
    </div>
  )
}

export function DrawerFormFooter({
  error,
  onCancel,
  children,
}: {
  error?: string
  onCancel?: () => void
  children: ReactNode
}) {
  return (
    <footer className="shrink-0 space-y-3 px-4 py-3">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 max-md:[&>*]:flex-1">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {appCopy.common.cancel}
          </Button>
        ) : null}
        {children}
      </div>
    </footer>
  )
}

// Lets a drawer be driven by its own trigger or by a parent (e.g. an "Edit" menu item).
export function useControllableOpen(open?: boolean, onOpenChange?: (open: boolean) => void) {
  const [internal, setInternal] = useState(false)
  const isControlled = open !== undefined

  return [
    isControlled ? open : internal,
    (next: boolean) => {
      if (!isControlled) setInternal(next)
      onOpenChange?.(next)
    },
  ] as const
}
