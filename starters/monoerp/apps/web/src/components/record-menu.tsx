import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { appCopy } from '@/lib/app.copy'

// Overflow menu for a single record: optional edit, optional extra items, delete.
export function RecordMenu({
  label = appCopy.common.actions,
  onEdit,
  onDelete,
  size = 'icon',
  variant = 'outline',
  children,
}: {
  label?: string
  onEdit?: () => void
  onDelete?: () => void
  size?: 'icon' | 'icon-sm'
  variant?: 'outline' | 'ghost'
  children?: ReactNode
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <DropdownMenuTrigger
          render={<TooltipTrigger render={<Button variant={variant} size={size} />} />}
        >
          <MoreHorizontal />
          <span className="sr-only">{label}</span>
        </DropdownMenuTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-40">
        {onEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil />
            {appCopy.common.edit}
          </DropdownMenuItem>
        ) : null}
        {children}
        {onDelete ? (
          <>
            {onEdit || children ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              {appCopy.common.delete}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
