import type { Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff, X } from 'lucide-react'

import type { GridFeatures } from '@/components/data-table/grid'
import { getColumnHeaderLabel } from '@/components/data-table/grid'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { appCopy } from '@/lib/app.copy'

export function ColumnHeader<TData extends object>({
  column,
  title = getColumnHeaderLabel(column),
}: {
  column: Column<GridFeatures, TData, unknown>
  title?: string
}) {
  const sorted = column.getIsSorted()
  const canSort = column.getCanSort()
  const canHide = column.getCanHide() && !column.getIsPinned()

  const icon = !canSort ? null : sorted === 'asc' ? (
    <ArrowUp />
  ) : sorted === 'desc' ? (
    <ArrowDown />
  ) : (
    <ChevronsUpDown />
  )

  if (!canSort && !canHide)
    return (
      <span className="text-[0.8125rem] font-normal text-secondary-foreground/80">{title}</span>
    )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={appCopy.table.menu(title)}
            className="-ml-2 h-6 gap-1.5 rounded-md px-2 text-[0.8125rem] font-normal text-secondary-foreground/80 hover:bg-secondary [&_svg]:size-3.25 [&_svg]:opacity-60"
          >
            {title}
            {icon}
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {canSort ? (
          <>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp />
              {appCopy.table.sortAsc}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown />
              {appCopy.table.sortDesc}
            </DropdownMenuItem>
            {sorted ? (
              <DropdownMenuItem onClick={() => column.clearSorting()}>
                <X />
                {appCopy.table.clearSort}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {canHide ? (
          <>
            {canSort ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff />
              {appCopy.table.hide}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
