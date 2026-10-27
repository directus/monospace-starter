import type { ComponentProps } from 'react'

import { DataTable } from '@/components/data-table/data-table'
import { DataError, DataLoading } from '@/components/data-state'

export function ListTable<TData extends object>({
  query,
  ...props
}: ComponentProps<typeof DataTable<TData>> & {
  query: { isPending: boolean; isError: boolean; error: Error | null; data?: unknown }
}) {
  return (
    <>
      {query.isPending ? <DataLoading className="max-md:mx-4" /> : null}
      {query.isError && query.error ? (
        <DataError error={query.error} className="max-md:mx-4" />
      ) : null}
      {query.data ? <DataTable {...props} /> : null}
    </>
  )
}
