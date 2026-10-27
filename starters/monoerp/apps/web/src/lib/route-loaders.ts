import { MonospaceNotFoundError } from '@monospace/sdk'
import type { FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

export async function ensureOrNotFound<T, K extends QueryKey>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, K>,
) {
  try {
    return await queryClient.ensureQueryData(options)
  } catch (error) {
    if (error instanceof MonospaceNotFoundError) throw notFound()

    throw error
  }
}
