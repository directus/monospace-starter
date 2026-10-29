import { MonospaceNotFoundError } from '@monospace/sdk'
import type { QueryClient, QueryExecuteOptions, QueryKey } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

// `staleTime: 'static'` returns cached data without waiting on a refetch, so a stale cache never
// blocks navigation; the component's query refreshes it in the background.
export async function ensureOrNotFound<T, K extends QueryKey>(
  queryClient: QueryClient,
  options: QueryExecuteOptions<T, Error, T, T, K>,
) {
  try {
    return await queryClient.query({ ...options, staleTime: 'static' })
  } catch (error) {
    if (error instanceof MonospaceNotFoundError) throw notFound()

    throw error
  }
}
