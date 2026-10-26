import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid } from '@/generated/monospace'
import { ownerOption } from '@/lib/format'
import { readMembers, searchMembers } from '@/lib/monospace-system'

const LOOKUP_LIMIT = 8

export async function resolveUsers(ids: Array<Uuid>): Promise<Array<RelationOption>> {
  if (!ids.length) return []

  const rows = await readMembers(ids)

  return rows.flatMap((row) => {
    const option = ownerOption(row)

    return option ? [option] : []
  })
}

export async function lookupUsers(q: string): Promise<Array<RelationOption>> {
  const rows = await searchMembers(q, LOOKUP_LIMIT)

  return rows.flatMap((row) => {
    const option = ownerOption(row)

    return option ? [option] : []
  })
}
