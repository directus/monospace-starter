import type { QueryKey } from '@tanstack/react-query'
import { infiniteQueryOptions } from '@tanstack/react-query'

export type ListSort = { id: string; desc: boolean } | null

export type ListParams<TFilter> = { q?: string; filter?: TFilter; sort?: ListSort }

export type Page = { offset?: number; limit?: number }

export const PAGE_SIZE = 50

export type Sorts<T> = Record<string, (direction: 'asc' | 'desc') => T>

export function sortSpec<T>(sorts: Sorts<T>, sort: ListSort | undefined, fallback: T) {
  const toSort = sort ? sorts[sort.id] : undefined

  return toSort ? toSort(sort?.desc ? 'desc' : 'asc') : fallback
}

export function nextOffset<T>(lastPage: Array<T>, pages: Array<Array<T>>) {
  return lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE
}

export function pagesQuery<T>(key: QueryKey, fetchPage: (page: Page) => Promise<Array<T>>) {
  return infiniteQueryOptions({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage({ offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

// Reads that need every row (boards, dashboards) take big pages: each page waits on the one before,
// since Monospace returns no total to fetch them in parallel. Usually one request.
export const ALL_PAGE_SIZE = 500

// Advance by the raw page length, before callers discard rows with hidden ids.
export async function readAllPages<T>(fetchPage: (page: Page) => Promise<Array<T>>) {
  const rows: Array<T> = []

  for (let offset = 0; ; offset += ALL_PAGE_SIZE) {
    const page = await fetchPage({ offset, limit: ALL_PAGE_SIZE })
    rows.push(...page)

    if (page.length < ALL_PAGE_SIZE) return rows
  }
}
