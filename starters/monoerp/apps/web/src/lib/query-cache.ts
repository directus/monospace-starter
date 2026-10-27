import type { QueryClient, QueryFilters } from '@tanstack/react-query'

// Writes an edit into cached reads before the server answers: cancels refetches in flight (they'd
// land with the old value), then applies `update` to every cached query under `queryKey`.
// Returns a function that puts the old data back if the write fails.
export async function patchCached<T>(
  queryClient: QueryClient,
  filters: QueryFilters,
  update: (data: T) => T,
) {
  await queryClient.cancelQueries(filters)

  const previous = queryClient.getQueriesData<T>(filters)

  queryClient.setQueriesData<T>(filters, (data) => (data === undefined ? data : update(data)))

  return () => {
    for (const [key, data] of previous) queryClient.setQueryData(key, data)
  }
}

export function patchRow<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>) {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
}
