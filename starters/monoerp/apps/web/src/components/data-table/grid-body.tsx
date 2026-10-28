import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { flexRender, Subscribe } from '@tanstack/react-table'
import type { Column, Header, Row } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

import { useGrid } from '@/components/data-table/grid'
import type { GridFeatures } from '@/components/data-table/grid'
import { Checkbox } from '@/components/ui/checkbox'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

function pinStyle<TData extends object>(
  column: Column<GridFeatures, TData, unknown>,
): CSSProperties {
  const pinned = column.getIsPinned()

  return {
    width: column.getSize(),
    position: pinned ? 'sticky' : undefined,
    insetInlineStart: pinned === 'start' ? column.getStart('start') : undefined,
    insetInlineEnd: pinned === 'end' ? column.getAfter('end') : undefined,
    zIndex: pinned ? 20 : undefined,
  }
}

function HeaderCell<TData extends object>({
  header,
  index,
}: {
  header: Header<GridFeatures, TData, unknown>
  index: number
}) {
  const { column } = header
  const pinned = column.getIsPinned()

  const { ref, handleRef, isDragging } = useSortable({
    id: column.id,
    index,
    type: 'table-column',
    accept: 'table-column',
    disabled: Boolean(pinned),
  })

  const sort = column.getIsSorted()

  return (
    <th
      ref={pinned ? undefined : ref}
      scope="col"
      data-pinned={pinned || undefined}
      aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
      style={pinStyle(column)}
      className={cn(
        'group relative h-10 border-r px-3 text-left align-middle font-medium data-pinned:bg-background',
        (index === 0 || column.getIsLastColumn()) && 'px-5 sm:px-6',
        isDragging && 'z-50 bg-popover shadow-md',
        column.columnDef.meta?.headerClassName,
      )}
    >
      <div className={cn('flex items-center', column.columnDef.meta?.headerClassName)}>
        {!pinned ? (
          <button
            ref={handleRef}
            type="button"
            aria-label={appCopy.table.reorder(column.columnDef.meta?.headerTitle ?? column.id)}
            className="absolute left-0 grid h-6 w-3 cursor-grab touch-none place-items-center text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <GripVertical className="size-3" />
          </button>
        ) : null}
        {header.isPlaceholder ? null : flexRender(column.columnDef.header, header.getContext())}
      </div>
      {column.getCanResize() ? (
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={appCopy.table.resize(column.columnDef.meta?.headerTitle ?? column.id)}
          aria-valuenow={Math.round(column.getSize())}
          onDoubleClick={() => column.resetSize()}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const delta = event.key === 'ArrowRight' ? 10 : -10
            column.table.setColumnSizing((previous) => ({
              ...previous,
              [column.id]: Math.min(
                column.columnDef.maxSize ?? Infinity,
                Math.max(column.columnDef.minSize ?? 80, column.getSize() + delta),
              ),
            }))
          }}
          className="absolute inset-y-0 right-0 z-30 w-1 cursor-col-resize touch-none select-none hover:bg-primary/40 focus-visible:bg-primary/40"
        />
      ) : null}
    </th>
  )
}

function BodyRow<TData extends object>({
  row,
  index,
}: {
  row: Row<GridFeatures, TData>
  index: number
}) {
  const columns = row.getVisibleCells()

  const cells = [
    ...row.getStartVisibleCells(),
    ...row.getCenterVisibleCells(),
    ...row.getEndVisibleCells(),
  ]

  return (
    <tr
      data-row-id={row.id}
      data-index={index}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className="h-[49px] hover:bg-muted/40 data-[state=selected]:bg-muted/50"
    >
      {cells.map((cell, i) => (
        <td
          key={cell.id}
          data-pinned={cell.column.getIsPinned() || undefined}
          style={pinStyle(cell.column)}
          className={cn(
            'truncate border-b px-3 py-1.5 align-middle data-pinned:bg-background',
            (i === 0 || i === columns.length - 1) && 'px-5 sm:px-6',
            cell.column.getIsPinned() === 'start' &&
              cell.column.getIsLastColumn('start') &&
              'shadow-[inset_-1px_0_0_0_var(--border)]',
            cell.column.columnDef.meta?.cellClassName,
          )}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
      <td className="border-b" />
    </tr>
  )
}

export function GridBody<TData extends object>({
  onReorder,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  onReorder: (from: string, to: string) => void
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore?: () => void
}) {
  const { table, props } = useGrid<TData>()
  const viewport = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows

  const headers = [
    ...(table.getStartHeaderGroups()[0]?.headers ?? []),
    ...(table.getCenterHeaderGroups()[0]?.headers ?? []),
    ...(table.getEndHeaderGroups()[0]?.headers ?? []),
  ]

  // The scroll area owns scrolling. The table wrapper only measures content.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () =>
      viewport.current?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null,
    estimateSize: () => 49,
    overscan: 10,
    getItemKey: (index) => rows[index].id,
  })

  const items = virtualizer.getVirtualItems()
  const last = items.at(-1)?.index
  const requestedAt = useRef<number | null>(null)

  useEffect(() => {
    if (
      !hasMore ||
      isLoadingMore ||
      last === undefined ||
      last < rows.length - 11 ||
      requestedAt.current === rows.length
    )
      return
    requestedAt.current = rows.length
    onLoadMore?.()
  }, [hasMore, isLoadingMore, last, rows.length, onLoadMore])

  const first = items[0]?.start ?? 0
  const tail = Math.max(0, virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0))
  const span = headers.length + 1

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        const { source } = event.operation

        if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return
        const target = headers[source.index]?.column

        if (target && !target.getIsPinned()) onReorder(String(source.id), target.id)
      }}
    >
      <div ref={viewport} data-slot="data-grid-table-viewport">
        <table
          data-slot="data-grid-table"
          className="table-fixed border-separate border-spacing-0 text-left text-sm"
          style={{ width: `max(100%, ${table.getTotalSize()}px)` }}
        >
          <colgroup>
            {headers.map((header) => (
              <col key={header.id} style={{ width: header.getSize() }} />
            ))}
            <col />
          </colgroup>
          <thead className="sticky top-0 z-40 bg-background shadow-[0_1px_0_0_var(--border)]">
            <tr>
              {headers.map((header, index) => (
                <HeaderCell key={header.id} header={header} index={index} />
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {first > 0 ? (
              <tr aria-hidden>
                <td colSpan={span} style={{ height: first }} />
              </tr>
            ) : null}
            {items.map((item) => (
              <BodyRow key={item.key} row={rows[item.index]} index={item.index} />
            ))}
            {tail > 0 ? (
              <tr aria-hidden>
                <td colSpan={span} style={{ height: tail }} />
              </tr>
            ) : null}
            {!rows.length ? (
              <tr>
                <td colSpan={span} className="px-4 py-10 text-center text-muted-foreground">
                  {props.emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </DragDropProvider>
  )
}

export function RowSelect<TData extends object>({ row }: { row: Row<GridFeatures, TData> }) {
  return (
    <div className="flex justify-center">
      <Subscribe
        source={row.table.atoms.rowSelection}
        selector={(selection) => Boolean(selection[row.id])}
      >
        {(selected) => (
          <Checkbox
            aria-label={appCopy.table.selectRow}
            checked={selected}
            onCheckedChange={(checked) => row.toggleSelected(checked)}
          />
        )}
      </Subscribe>
    </div>
  )
}

export function RowSelectAll() {
  const { table } = useGrid()

  return (
    <div className="flex justify-center">
      <Subscribe source={table.atoms.rowSelection}>
        {() => (
          <Checkbox
            aria-label={appCopy.table.selectAll}
            checked={table.getIsAllRowsSelected()}
            indeterminate={!table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()}
            onCheckedChange={(checked) => table.toggleAllRowsSelected(Boolean(checked))}
          />
        )}
      </Subscribe>
    </div>
  )
}
