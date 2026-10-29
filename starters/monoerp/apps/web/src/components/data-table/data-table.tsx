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

import { ColumnHeader } from '@/components/data-table/column-header'
import { Grid, GridContainer, gridFeatures } from '@/components/data-table/grid'
import type { GridFeatures, TableInstance } from '@/components/data-table/grid'
import { RowSelect, RowSelectAll, GridBody } from '@/components/data-table/grid-body'
import { LoadMoreSentinel } from '@/components/data-table/load-more-sentinel'
import { GridScrollArea } from '@/components/data-table/scroll-area'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { appStorageKey } from '@/lib/storage'
import { cn } from '@/lib/utils'

// List-page table: sortable, hideable, resizable,
// drag-to-reorder columns, with the first column pinned so the row's name stays put while the rest
// scrolls. Sorting is server-side and lives in the URL (the page owns it); visibility, order, and
// widths persist per table in localStorage. Rows are virtualized and arrive in pages: the grid is
// its own scroller (fill the remaining height with `flex-1 min-h-0` on the page) and asks for the
// next page as the end comes into view. On phones, pages that pass `mobileRow` get a plain stacked
// list instead (same rows, sort, and paging; no selection or column controls).

// Widths by what a column shows, so every list sizes the same content the same way. Minimums
// keep the content readable in an end column, which has wider padding (a date fits 'Aug 20, 2026').
export const columnWidths = {
  primary: { size: 240, minSize: 200 },
  person: { size: 200, minSize: 140 },
  text: { size: 180, minSize: 100 },
  email: { size: 240, minSize: 160 },
  badge: { size: 140, minSize: 110 },
  date: { size: 150, minSize: 140 },
  money: { size: 140, minSize: 120 },
  number: { size: 110, minSize: 96 },
} satisfies Record<string, { size: number; minSize: number }>

export type ColumnKind = keyof typeof columnWidths

// Every column needs an explicit id: saved layouts and column order are keyed by it. The header
// is plain text; the table adds the column header menu. `kind` sets the width.
export type DataTableColumn<TData extends object> = ColumnDef<GridFeatures, TData> & {
  id: string
  header: string
  kind: ColumnKind
}

type GridColumn<TData extends object> = ColumnDef<GridFeatures, TData>

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
    header: () => <RowSelectAll />,
    cell: ({ row }) => <RowSelect row={row} />,
    size: 44,
    minSize: 44,
    maxSize: 44,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    meta: { skeleton: null, headerClassName: 'justify-center px-0', cellClassName: 'px-0' },
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
  return columns.map(({ kind, ...column }) => {
    const title = column.header

    const header: GridColumn<TData>['header'] = ({ column: instance }) => (
      <ColumnHeader column={instance} title={title} />
    )

    return {
      ...columnWidths[kind],
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
  const storageKey = appStorageKey(`table:${id}`)
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
    features: gridFeatures,
    columns: decorated,
    data: rows,
    getRowId,
    columnResizeMode: 'onChange',
    manualSorting: true,
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

  const onDragEnd = useCallback((fromId: string, toId: string) => {
    setLayout((current) => {
      const from = current.order.indexOf(fromId)
      const to = current.order.indexOf(toId)

      if (from < 0 || to < 0 || from === to) return current
      const order = [...current.order]
      order.splice(to, 0, ...order.splice(from, 1))

      return { ...current, order }
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
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  emptyMessage = appCopy.data.empty,
  mobileRow,
  children,
}: {
  table: TableInstance<TData>
  onDragEnd: (fromId: string, toId: string) => void
  // Plural noun for the "all loaded" line.
  noun: string
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
    <Grid table={table} emptyMessage={emptyMessage}>
      <GridContainer className="relative min-h-0 flex-1 border-y">
        <GridScrollArea className="h-full">
          <GridBody
            onReorder={onDragEnd}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
          />
        </GridScrollArea>
        {children}
      </GridContainer>
      {status}
    </Grid>
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
