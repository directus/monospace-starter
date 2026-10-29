import type { InfiniteData, QueryKey, UseInfiniteQueryOptions } from '@tanstack/react-query'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useDataTable } from '@/components/data-table/data-table'
import type { DataTableColumn } from '@/components/data-table/data-table'
import type { Uuid } from '@/generated/monospace'
import { EMPTY_FILTERS, isFilterQueryEmpty } from '@/lib/filters'
import type { ListFilterQuery } from '@/lib/filters'
import { parseSort, serializeSort } from '@/lib/list-search'
import type { ListSearch } from '@/lib/list-search'

type SearchPatch = Partial<Pick<ListSearch, 'q' | 'sort' | 'filters' | 'display'>>

export function useListSearch({
  search,
  onSearchChange,
}: {
  search: ListSearch
  onSearchChange: (patch: SearchPatch) => void
}) {
  const sort = parseSort(search.sort)
  const display = search.display ?? 'table'

  return {
    q: search.q ?? '',
    query: search.filters ?? EMPTY_FILTERS,
    sort,
    display,
    setQ: (q: string) => onSearchChange({ q: q || undefined }),
    setSort: (next: typeof sort) => onSearchChange({ sort: serializeSort(next) }),
    setDisplay: (next: typeof display) => onSearchChange({ display: next }),
    setFilters: (next: ListFilterQuery) =>
      onSearchChange({
        filters: isFilterQueryEmpty(next) ? undefined : next,
      }),
  }
}

export function useListPage<TData extends { id: Uuid }, TParams, TKey extends QueryKey>({
  id,
  columns,
  getColumns,
  search,
  onSearchChange,
  params,
  query,
  selectable,
  board,
}: {
  id: string
  columns?: DataTableColumn<TData>[]
  getColumns?: (rows: TData[]) => DataTableColumn<TData>[]
  search: ListSearch
  onSearchChange: (patch: SearchPatch) => void
  params: TParams
  query: (
    params: TParams,
  ) => UseInfiniteQueryOptions<TData[], Error, InfiniteData<TData[]>, TKey, number>
  selectable?: boolean
  board?: boolean
}) {
  const state = useListSearch({ search, onSearchChange })
  const list = useInfiniteQuery({ ...query(params), enabled: !board || state.display === 'table' })
  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data])

  const resolvedColumns = useMemo(
    () => getColumns?.(rows) ?? columns ?? [],
    [columns, getColumns, rows],
  )

  const layout = useDataTable({
    id,
    columns: resolvedColumns,
    rows,
    getRowId: (row) => row.id,
    sort: state.sort,
    onSortChange: state.setSort,
    selectable,
    selectionKey: JSON.stringify(params),
  })

  return {
    ...state,
    ...layout,
    list,
    rows,
    params,
    tableProps: {
      table: layout.table,
      onDragEnd: layout.onDragEnd,
      hasMore: list.hasNextPage,
      isLoadingMore: list.isFetchingNextPage,
      onLoadMore: () => void list.fetchNextPage(),
    },
    displayProps: {
      sort: state.sort,
      onSortChange: state.setSort,
      table: layout.table,
      isDefaultLayout: layout.isDefaultLayout,
      onResetColumns: layout.resetLayout,
      display: board ? state.display : undefined,
      onDisplayChange: board ? state.setDisplay : undefined,
    },
  }
}
