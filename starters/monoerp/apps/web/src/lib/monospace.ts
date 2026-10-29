import { createClient } from '@monospace/sdk'

import type { Schema, Uuid } from '@/generated/monospace'
import { authenticatedHttp } from '@/lib/monospace-http'
import { workspace } from '@/lib/workspace'

// The generated Schema exists even when the CLI omits its empty-workspace client factory.
export const monospace = createClient<Schema>({
  url: '',
  http: authenticatedHttp,
  workspace,
})

// Monospace nulls any field, the primary key included, when a conditional field rule fails.
// A row without its id can't be opened, edited, or deleted, so it never leaves the fetch.
export function keyed<T extends { id: Uuid | null }>(rows: ReadonlyArray<T>) {
  return rows.flatMap((row) => (row.id ? [{ ...row, id: row.id }] : []))
}
