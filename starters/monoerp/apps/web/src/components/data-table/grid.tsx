import {
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  metaHelper,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'
import type { Column, ReactTable, RowData } from '@tanstack/react-table'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface GridColumnMeta {
  headerTitle?: string
  headerClassName?: string
  cellClassName?: string
  skeleton?: ReactNode
}

// Lists sort and page on the server. Only layout and selection run in the browser.
export const gridFeatures = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  rowSelectionFeature,
  columnMeta: metaHelper<GridColumnMeta>(),
})

export type GridFeatures = typeof gridFeatures

export type TableInstance<TData extends object> = ReactTable<GridFeatures, TData>

export function getColumnHeaderLabel<TData extends RowData, TValue>(
  column: Column<GridFeatures, TData, TValue>,
): string {
  const header = column.columnDef.header

  return (
    column.columnDef.meta?.headerTitle ??
    (header !== undefined && !(header instanceof Function) ? header : String(column.id))
  )
}

// React context erases the row type. Each reader belongs to the table that supplied its TData.
const GridContext = createContext<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: TableInstance<any>
  props: { emptyMessage: string; tableLayout: { headerSticky: true; columnsPinnable: true } }
} | null>(null)

export function useGrid<TData extends object>() {
  const value = useContext(GridContext)

  if (!value) throw new Error('Grid parts require a Grid')

  // SAFETY: the context is read only under the Grid that supplied this row type.
  return value as { table: TableInstance<TData>; props: typeof value.props }
}

export function Grid<TData extends object>({
  table,
  emptyMessage,
  children,
}: {
  table: TableInstance<TData>
  emptyMessage: string
  children: ReactNode
}) {
  // SAFETY: each reader restores this same table's TData through useGrid.
  const erased = table as TableInstance<any>

  return (
    <GridContext.Provider
      value={{
        table: erased,
        props: { emptyMessage, tableLayout: { headerSticky: true, columnsPinnable: true } },
      }}
    >
      {children}
    </GridContext.Provider>
  )
}

export function GridContainer({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div data-slot="data-grid" className={cn('w-full overflow-hidden', className)}>
      {children}
    </div>
  )
}
