import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { functionalUpdate, useTable } from '@tanstack/react-table'
import type {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  ColumnVisibilityState,
  RowSelectionState,
} from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { LoadMoreSentinel } from '@/components/load-more-sentinel'
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
} from '@/components/reui/data-grid/data-grid'
import type { DataGridFeatures, DataGridTableInstance } from '@/components/reui/data-grid/data-grid'
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/reui/data-grid/data-grid-table'
import { DataGridTableVirtual } from '@/components/reui/data-grid/data-grid-table-virtual'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

// List-page table on reUI's data grid (components/reui/data-grid): sortable, hideable, resizable,
// drag-to-reorder columns, with the first column pinned so the row's name stays put while the rest
// scrolls. Sorting is server-side and lives in the URL (the page owns it); visibility, order, and
// widths persist per table in localStorage. Rows are virtualized and arrive in pages: the grid is
// its own scroller (fill the remaining height with `flex-1 min-h-0` on the page) and asks for the
// next page as the end comes into view. On phones, pages that pass `mobileRow` get a plain stacked
// list instead (same rows, sort, and paging; no selection or column controls).

// Every column needs an explicit id: saved layouts and column order are keyed by it. The header
// is plain text; the table turns it into reUI's column header (menu, sort arrows).
export type DataTableColumn<TData extends object> = ColumnDef<DataGridFeatures, TData> & {
  id: string
  header: string
}

type GridColumn<TData extends object> = ColumnDef<DataGridFeatures, TData>

export type DataTableSort = { id: string; desc: boolean } | null

type Layout = {
  visibility: ColumnVisibilityState
  order: ColumnOrderState
  sizing: ColumnSizingState
}

const EMPTY_LAYOUT: Layout = { visibility: {}, order: [], sizing: {} }

// Saved per browser, so it may be from an older build or hand-edited.
const savedLayout = z
  .object({
    visibility: z.record(z.string(), z.boolean()),
    order: z.array(z.string()),
    sizing: z.record(z.string(), z.number()),
  })
  .partial()

const SELECT_COLUMN = 'select'

// Checkbox column, pinned ahead of the name column. Not part of the saved layout.
function selectColumn<TData extends object>(): GridColumn<TData> {
  return {
    id: SELECT_COLUMN,
    header: () => <DataGridTableRowSelectAll />,
    cell: ({ row }) => <DataGridTableRowSelect row={row} />,
    size: 44,
    minSize: 44,
    maxSize: 44,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    meta: { skeleton: null, headerClassName: 'px-0', cellClassName: 'px-0' },
  }
}

function readLayout(key: string): Layout {
  if (typeof window === 'undefined') return EMPTY_LAYOUT

  try {
    const raw = window.localStorage.getItem(key)

    const saved = raw ? savedLayout.safeParse(JSON.parse(raw)) : null

    return saved?.success ? { ...EMPTY_LAYOUT, ...saved.data } : EMPTY_LAYOUT
  } catch {
    return EMPTY_LAYOUT
  }
}

// Saved order first (dropping columns that no longer exist), then anything new at the end.
function reconcileOrder(saved: ColumnOrderState, ids: Array<string>) {
  const current = new Set(ids)
  const known = saved.filter((id) => current.has(id))
  const placed = new Set(known)

  return [...known, ...ids.filter((id) => !placed.has(id))]
}

function withHeaders<TData extends object>(
  columns: Array<DataTableColumn<TData>>,
): Array<GridColumn<TData>> {
  return columns.map((column) => {
    const title = column.header

    const header: GridColumn<TData>['header'] = ({ column: instance }) => (
      <DataGridColumnHeader column={instance} title={title} />
    )

    return {
      ...column,
      meta: { headerTitle: title, ...column.meta },
      header,
    }
  })
}

export function useDataTable<TData extends object, TId extends string = string>({
  id,
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  selectable = false,
  selectionKey,
}: {
  // Storage key for the column layout.
  id: string
  columns: Array<DataTableColumn<TData>>
  rows: Array<TData>
  getRowId: (row: TData) => TId
  sort: DataTableSort
  onSortChange: (sort: DataTableSort) => void
  // Adds a checkbox column; selection is by row id and survives paging.
  selectable?: boolean
  // Selection is dropped whenever this changes (the page's search, filters, sort).
  selectionKey?: string
}) {
  const storageKey = `table:${id}`
  const ids = useMemo(() => columns.map((column) => column.id), [columns])

  const [layout, setLayout] = useState<Layout>(() => {
    const saved = readLayout(storageKey)

    return { ...saved, order: reconcileOrder(saved.order, ids) }
  })

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(layout))
  }, [layout, storageKey])

  const patch = (next: Partial<Layout>) => setLayout((current) => ({ ...current, ...next }))
  const sorting = useMemo(() => (sort ? [sort] : []), [sort])

  const decorated = useMemo(
    () => (selectable ? [selectColumn<TData>(), ...withHeaders(columns)] : withHeaders(columns)),
    [columns, selectable],
  )

  const pinned = selectable ? [SELECT_COLUMN, ids[0] ?? ''] : ids[0] ? [ids[0]] : []
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  // Reset-on-key during render rather than in an effect, so no stale selection ever paints.
  const [selectionKeyState, setSelectionKeyState] = useState(selectionKey)

  if (selectionKeyState !== selectionKey) {
    setSelectionKeyState(selectionKey)
    setRowSelection({})
  }

  const table = useTable({
    features: dataGridFeatures,
    columns: decorated,
    data: rows,
    getRowId,
    defaultColumn: { minSize: 80, size: 180 },
    columnResizeMode: 'onChange',
    manualSorting: true,
    // Paging is by scrolling; reUI's feature bundle would otherwise page rows client-side.
    manualPagination: true,
    enableRowSelection: selectable,
    enableMultiSort: false,
    enableSortingRemoval: true,
    state: {
      sorting,
      columnVisibility: layout.visibility,
      columnOrder: selectable ? [SELECT_COLUMN, ...layout.order] : layout.order,
      columnSizing: layout.sizing,
      columnPinning: { start: pinned, end: [] },
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => onSortChange(functionalUpdate(updater, sorting)[0] ?? null),
    onColumnVisibilityChange: (updater) =>
      patch({ visibility: functionalUpdate(updater, layout.visibility) }),
    onColumnOrderChange: (updater) => {
      const next = functionalUpdate(updater, layout.order)
      patch({ order: next.filter((columnId) => columnId !== SELECT_COLUMN) })
    },
    onColumnSizingChange: (updater) => {
      const next = functionalUpdate(updater, layout.sizing)
      // Whole pixels: fractional widths from a drag can sum past the container by a hair and
      // show a horizontal scrollbar for nothing.
      patch({
        sizing: Object.fromEntries(
          Object.entries(next).map(([id, size]) => [id, Math.round(size)]),
        ),
      })
    },
  })

  const resetLayout = () => setLayout({ ...EMPTY_LAYOUT, order: ids })

  // Nothing hidden, resized, or reordered; lets a UI show Reset only when it would do something.
  const isDefaultLayout =
    Object.values(layout.visibility).every(Boolean) &&
    Object.keys(layout.sizing).length === 0 &&
    layout.order.every((id, index) => id === ids[index])

  const onDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setLayout((current) => {
      const from = current.order.indexOf(String(active.id))
      const to = current.order.indexOf(String(over.id))

      return from === -1 || to === -1
        ? current
        : { ...current, order: arrayMove(current.order, from, to) }
    })
  }, [])

  // Read back through the rows rather than the selection's string keys, so ids keep their type.
  const selectedIds = useMemo(
    () => rows.map(getRowId).filter((rowId) => rowSelection[rowId]),
    [rows, getRowId, rowSelection],
  )

  const clearSelection = useCallback(() => setRowSelection({}), [])

  return { table, resetLayout, isDefaultLayout, onDragEnd, selectedIds, clearSelection }
}

export function DataTable<TData extends object>({
  table,
  onDragEnd,
  noun,
  pinnable = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  emptyMessage = appCopy.data.empty,
  mobileRow,
  children,
}: {
  table: DataGridTableInstance<TData>
  onDragEnd: (event: DragEndEvent) => void
  // Plural noun for the "all loaded" line.
  noun: string
  // Let users pin and unpin columns themselves. Off by default: the first column is always
  // pinned and the pin controls stay hidden.
  pinnable?: boolean
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  emptyMessage?: string
  // One record as a phone row, usually a `DataTableMobileRow`.
  mobileRow?: (row: TData) => ReactNode
  // Overlays inside the grid viewport, such as a bulk action bar.
  children?: ReactNode
}) {
  const isMobile = useIsMobile()
  const rows = table.getRowModel().rows
  const count = rows.length

  const status = (
    <div className="flex h-9 shrink-0 items-center border-b bg-background px-4 text-xs text-muted-foreground md:px-6">
      {isLoadingMore
        ? appCopy.filters.loadingMore
        : hasMore
          ? appCopy.list.showing(count, noun)
          : appCopy.filters.allLoaded(count, noun)}
    </div>
  )

  if (isMobile && mobileRow) {
    return (
      <>
        <div className="relative flex-1 border-y">
          {count ? (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id}>{mobileRow(row.original)}</li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          <LoadMoreSentinel
            enabled={hasMore && !isLoadingMore && Boolean(onLoadMore)}
            onVisible={() => onLoadMore?.()}
          />
          {children}
        </div>
        {status}
      </>
    )
  }

  return (
    <DataGrid
      table={table}
      recordCount={count}
      emptyMessage={emptyMessage}
      fetchingMoreMessage={appCopy.filters.loadingMore}
      allRowsLoadedMessage={appCopy.filters.allLoaded(count, noun)}
      // Collapsed table borders don't stick with the header, so the divider is a shadow instead.
      tableClassNames={{
        headerSticky: 'sticky top-0 z-40 bg-background shadow-[0_1px_0_0_var(--border)]',
        edgeCell: 'px-5 sm:px-6',
      }}
      tableLayout={{
        headerSticky: true,
        columnsPinnable: true,
        columnsPinControls: pinnable,
        columnsResizable: true,
        columnsResizeMode: 'onChange',
        columnsDraggable: true,
        columnsMovable: true,
        columnsVisibility: true,
      }}
    >
      <DataGridContainer className="relative min-h-0 flex-1 border-y">
        {/* reUI's own scrollbars: native ones are hidden, so there's no gutter to measure around. */}
        <DataGridScrollArea className="h-full">
          <DataGridTableVirtual
            estimateSize={53}
            handleDragEnd={onDragEnd}
            onFetchMore={onLoadMore}
            hasMore={hasMore}
            isFetchingMore={isLoadingMore}
            fetchMoreOffset={10}
            showCompletionRow={false}
          />
        </DataGridScrollArea>
        {children}
      </DataGridContainer>
      {status}
    </DataGrid>
  )
}

// A phone list row: leading avatar, a title, muted meta lines, and an optional trailing value.
// Pass `render={<Link ... />}` to make the whole row the tap target.
export function DataTableMobileRow({
  leading,
  title,
  meta = [],
  trailing,
  className,
  render,
  ...props
}: Omit<useRender.ComponentProps<'div'>, 'title'> & {
  leading?: ReactNode
  title: ReactNode
  meta?: Array<ReactNode>
  trailing?: ReactNode
}) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(
          'flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-muted active:bg-muted',
          className,
        ),
        children: (
          <>
            {leading}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{title}</div>
              {meta.filter(Boolean).map((line, index) => (
                <div key={index} className="mt-0.5 truncate text-xs text-muted-foreground">
                  {line}
                </div>
              ))}
            </div>
            {trailing ? <div className="shrink-0 text-sm">{trailing}</div> : null}
          </>
        ),
      },
      props,
    ),
  })
}
