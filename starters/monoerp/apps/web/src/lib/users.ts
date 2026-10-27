import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
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

export type OwnerLike = {
  id?: Uuid | null
  fullName?: string | null
  email?: string | null
  avatarId?: string | null
}

export function avatarUrl(avatarId: string | null | undefined) {
  return avatarId ? `/api/system/assets/${encodeURIComponent(avatarId)}` : undefined
}

export function ownerLabel(owner: OwnerLike | null | undefined) {
  return owner?.fullName ?? owner?.email ?? appCopy.fallback.unassigned
}

export function ownerOption(owner: OwnerLike | null | undefined) {
  return owner?.id
    ? {
        value: owner.id,
        label: ownerLabel(owner),
        description: owner.email ?? undefined,
        image: avatarUrl(owner.avatarId),
        avatar: true,
      }
    : null
}
