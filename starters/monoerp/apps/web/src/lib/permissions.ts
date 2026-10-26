import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import type { JsonValue, Uuid } from '@/generated/monospace'
import { useCurrentUser } from '@/lib/auth'
import { readUserPolicies } from '@/lib/monospace-system'

type Action = 'read' | 'create' | 'update' | 'delete'

// A rule is an object of conditions (possibly empty); its presence grants the action.
const rule = z.record(z.string(), z.json())

// The parts of a Monospace policy this reads: per collection, per action, a rule. Field rules
// are either '*' or a rule per field. Monospace keys both by API name, not id.
const policy = z.discriminatedUnion('access', [
  z.object({ access: z.literal('admin') }),
  z.object({
    access: z.literal('rules'),
    itemRules: z.record(z.string(), rule).optional(),
    fieldRules: z.record(z.string(), rule).optional(),
  }),
])

const grants = (value: JsonValue | undefined) => rule.safeParse(value).success

export function collectionPermissions(
  contents: ReadonlyArray<JsonValue | undefined>,
  apiName: string,
) {
  // Anything that isn't a policy this understands grants nothing.
  const policies = contents.flatMap((content) => {
    const parsed = policy.safeParse(content)

    return parsed.success ? [parsed.data] : []
  })

  const admin = policies.some((item) => item.access === 'admin')
  const rules = policies.flatMap((item) => (item.access === 'rules' ? [item] : []))

  const can = (action: Action) =>
    admin || rules.some((item) => grants(item.itemRules?.[apiName]?.[action]))

  const canField = (action: Exclude<Action, 'delete'>, field: string) =>
    admin ||
    rules.some((item) => {
      const allowed = item.fieldRules?.[apiName]?.[action]

      return allowed === '*' || grants(rule.safeParse(allowed).data?.[field])
    })

  return {
    admin,
    read: can('read'),
    create: can('create'),
    update: can('update'),
    delete: can('delete'),
    field: (field: string) => ({
      read: can('read') && canField('read', field),
      create: can('create') && canField('create', field),
      update: can('update') && canField('update', field),
    }),
  }
}

async function fetchCollectionPermissions(userId: Uuid, apiName: string) {
  return collectionPermissions(await readUserPolicies(userId), apiName)
}

export function collectionPermissionsQuery(userId: Uuid | undefined, apiName: string) {
  return queryOptions({
    queryKey: ['permissions', import.meta.env.VITE_MONOSPACE_WORKSPACE ?? 'crm', userId, apiName],
    staleTime: 30_000,
    queryFn: userId ? () => fetchCollectionPermissions(userId, apiName) : skipToken,
  })
}

export type CollectionPermissions = ReturnType<typeof collectionPermissions>

// What the signed-in user may do with a collection, for record pages and lists. Allows
// everything while the rules load or when they can't be read (a user may not be allowed to read
// roles), because Monospace refuses what isn't allowed either way. Fields are API names.
export function useCollectionAccess(apiName: string) {
  const user = useCurrentUser()
  const { data: access } = useQuery(collectionPermissionsQuery(user?.id, apiName))

  return {
    create: access?.create ?? true,
    delete: access?.delete ?? true,
    canUpdate: (field: string) => !access || access.field(field).update,
  }
}
