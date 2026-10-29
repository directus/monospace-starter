import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Subscribe } from '@tanstack/react-table'
import type { Column } from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  Kanban,
  RotateCcw,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'

import type { DataTableSort } from '@/components/data-table/data-table'
import type { GridFeatures, TableInstance } from '@/components/data-table/grid'
import { getColumnHeaderLabel } from '@/components/data-table/grid'
import type { ListDisplay } from '@/components/list-toolbar'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

const displays = [
  { value: 'table' as const, label: appCopy.list.display.table, icon: Table2 },
  { value: 'board' as const, label: appCopy.list.display.board, icon: Kanban },
]

type DisplayDefaultSort = NonNullable<DataTableSort> & { label: string }

export function DisplayMenu<TData extends object>({
  display = 'table',
  onDisplayChange,
  sort,
  defaultSort,
  onSortChange,
  table,
  isDefaultLayout,
  onResetColumns,
}: {
  display?: ListDisplay
  onDisplayChange?: (display: ListDisplay) => void
  sort: DataTableSort
  defaultSort: DisplayDefaultSort
  onSortChange: (sort: DataTableSort) => void
  table: TableInstance<TData>
  isDefaultLayout: boolean
  onResetColumns: () => void
}) {
  const columns = table.getAllLeafColumns()
  const order = table.state.columnOrder

  const pinned = new Set([
    ...(table.state.columnPinning.start ?? []),
    ...(table.state.columnPinning.end ?? []),
  ])

  const configurableColumns = columns.filter(
    (column) => column.getCanHide() && !pinned.has(column.id),
  )

  const configurableOrder = order.filter((id) =>
    configurableColumns.some((column) => column.id === id),
  )

  const sortable = columns.filter((column) => column.getCanSort())
  const effectiveSort = sort ?? defaultSort
  const selectedColumn = columns.find((column) => column.id === effectiveSort.id)
  const selectedLabel = selectedColumn ? getColumnHeaderLabel(selectedColumn) : defaultSort.label
  const canReset = Boolean(sort) || (display === 'table' && !isDefaultLayout)

  function reset() {
    onSortChange(null)

    if (display === 'table') onResetColumns()
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline">
            <SlidersHorizontal data-icon="inline-start" />
            {appCopy.list.display.label}
            <ChevronDown data-icon="inline-end" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        {onDisplayChange ? (
          <div className="grid grid-cols-2 gap-1 border-b p-2">
            {displays.map((option) => {
              const Icon = option.icon
              const selected = display === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onDisplayChange(option.value)}
                  className={cn(
                    'flex h-9 items-center justify-center gap-2 rounded-md text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected && 'bg-muted font-medium',
                  )}
                >
                  <Icon className="size-4" />
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : null}

        <div className="flex items-center gap-3 border-b p-3">
          <span className="text-sm text-muted-foreground">{appCopy.list.display.sort}</span>
          <ButtonGroup className="ml-auto">
            <Select
              value={effectiveSort.id}
              onValueChange={(id) => {
                if (!id) return
                onSortChange(id === defaultSort.id ? null : { id, desc: false })
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue>{selectedLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {!sortable.some((column) => column.id === defaultSort.id) ? (
                  <SelectItem value={defaultSort.id}>{defaultSort.label}</SelectItem>
                ) : null}
                {sortable.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {getColumnHeaderLabel(column)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={effectiveSort.desc ? appCopy.table.sortAsc : appCopy.table.sortDesc}
              onClick={() => onSortChange({ id: effectiveSort.id, desc: !effectiveSort.desc })}
            >
              {effectiveSort.desc ? <ArrowDown /> : <ArrowUp />}
            </Button>
          </ButtonGroup>
        </div>

        {display === 'table' ? (
          // Phones render list pages as rows, so column settings do nothing there.
          <div className="p-2 max-md:hidden">
            <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
              {appCopy.list.display.tableColumns}
            </p>
            <DragDropProvider
              onDragEnd={(event) => {
                const { source } = event.operation

                if (event.canceled || !isSortable(source) || source.initialIndex === source.index)
                  return
                const targetId = configurableOrder[source.index]
                const from = order.indexOf(String(source.id))
                const to = order.indexOf(targetId ?? '')

                if (from < 0 || to < 0) return
                const next = [...order]
                next.splice(to, 0, ...next.splice(from, 1))
                table.setColumnOrder(next)
              }}
            >
              <div className="space-y-0.5">
                {configurableOrder.flatMap((id, index) => {
                  const column = configurableColumns.find((candidate) => candidate.id === id)

                  return column ? [<ColumnRow key={id} column={column} index={index} />] : []
                })}
              </div>
            </DragDropProvider>
          </div>
        ) : null}

        {canReset ? (
          <div className="flex justify-end border-t p-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              {appCopy.list.display.reset}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function ColumnRow<TData extends object>({
  column,
  index,
}: {
  index: number
  column: Column<GridFeatures, TData, unknown>
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: column.id,
    index,
    type: 'display-column',
    accept: 'display-column',
  })

  return (
    <div
      ref={ref}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-2 hover:bg-muted',
        isDragging && 'relative z-10 bg-popover shadow-md',
      )}
    >
      <button
        type="button"
        aria-label={appCopy.table.reorder(getColumnHeaderLabel(column))}
        className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:size-8"
        ref={handleRef}
      >
        <GripVertical className="size-4" />
      </button>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
        <Subscribe
          source={column.table.atoms.columnVisibility}
          selector={(visibility) => visibility[column.id] !== false}
        >
          {(visible) => (
            <Checkbox
              checked={visible}
              onCheckedChange={(checked) => column.toggleVisibility(checked)}
            />
          )}
        </Subscribe>
        <span className="truncate">{getColumnHeaderLabel(column)}</span>
      </label>
    </div>
  )
}
