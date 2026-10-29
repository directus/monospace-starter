import type { ReactNode } from 'react'

import { DrawerFormBody, FormDrawer } from '@/components/form/form-drawer'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

// Dialog bodies bring their own DialogFooter; on a phone it sticks to the bottom of the
// sheet so the actions stay reachable when the keyboard shrinks it.
const pinnedFooter =
  '[&_[data-slot=dialog-footer]]:sticky [&_[data-slot=dialog-footer]]:-bottom-5 [&_[data-slot=dialog-footer]]:-mx-5 [&_[data-slot=dialog-footer]]:-mb-5 [&_[data-slot=dialog-footer]]:flex-row [&_[data-slot=dialog-footer]]:bg-background [&_[data-slot=dialog-footer]]:px-5 [&_[data-slot=dialog-footer]]:py-3 [&_[data-slot=dialog-footer]>*]:flex-1'

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  showCloseButton = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
  showCloseButton?: boolean
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <FormDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        showCloseButton={showCloseButton}
        autoHeight
      >
        <DrawerFormBody className={pinnedFooter}>{children}</DrawerFormBody>
      </FormDrawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto', className)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
