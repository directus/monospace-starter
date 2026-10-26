import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'

// Replaces the list's identity while anything is selected: count, bulk actions, clear.
export function SelectionActions({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="flex h-8 items-center gap-1 rounded-lg border bg-muted/40 pr-1 pl-3">
      <span className="text-sm font-medium tabular-nums">{appCopy.bulk.selected(count)}</span>
      <div className="mx-1 h-5 w-px bg-border" />
      {children}
      <Button variant="ghost" size="icon-sm" aria-label={appCopy.bulk.clear} onClick={onClear}>
        <X />
      </Button>
    </div>
  )
}
