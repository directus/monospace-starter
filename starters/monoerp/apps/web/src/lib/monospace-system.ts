import { z } from 'zod'

import type { JsonValue, Uuid } from '@/generated/monospace'
import { authenticatedHttp } from '@/lib/monospace-http'
import { uuidSchema } from '@/lib/uuid'

// Monospace's own tables (members, roles, policies) aren't collections in the generated client:
// since v0.7.0 each has its own endpoint. They're read here, and every answer is parsed on the way in.
const http = authenticatedHttp({
  url: '',
  workspace: import.meta.env.VITE_MONOSPACE_WORKSPACE ?? 'crm',
  credentials: 'include',
})

type Query = Record<string, string | number>

const listOf = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) })

const MEMBER_FIELDS = ['id', 'fullName', 'email', 'avatarId']

const member = z.object({
  id: uuidSchema,
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  avatarId: z.string().nullable(),
})

export type Member = z.infer<typeof member>

async function get<T extends z.ZodType>(schema: T, path: string, query: Query = {}) {
  return schema.parse(
    await http.request<JsonValue>({ method: 'GET', path, query, headers: new Headers() }),
  )
}

const fields = (names: ReadonlyArray<string>): Query =>
  Object.fromEntries(names.map((name, index) => [`fields[${index}]`, name]))

/** The workspace members with these ids. */
export async function readMembers(ids: ReadonlyArray<Uuid>) {
  const filter = Object.fromEntries(ids.map((id, index) => [`filter[id][_in][${index}]`, id]))

  const { data } = await get(listOf(member), '/members', {
    ...fields(MEMBER_FIELDS),
    ...filter,
    limit: ids.length,
  })

  return data
}

const USERS_TTL = 5 * 60_000

let knownUsers = new Map<Uuid, Member>()

let knownUsersAt = 0

// Owners and uploaders are looked up here and kept for a few minutes, instead of coming from an
// `owner` or `createdBy` include. Monospace never caches a query that includes a system user
// (docs/monospace.md, known issues), so one such include makes every list and record read skip
// its cache. This lookup is the only uncached read, and it only asks for users it hasn't seen.
export async function usersById(ids: ReadonlyArray<Uuid | null | undefined>) {
  if (Date.now() - knownUsersAt > USERS_TTL) {
    knownUsers = new Map()
    knownUsersAt = Date.now()
  }

  const missing = [...new Set(ids)].flatMap((id) => (id && !knownUsers.has(id) ? [id] : []))

  if (missing.length) {
    for (const user of await readMembers(missing)) knownUsers.set(user.id, user)
  }

  return knownUsers
}

/** Members whose name or email contains `q`, by name. */
export async function searchMembers(q: string, limit: number) {
  const filter: Query = q
    ? { 'filter[_or][0][fullName][_icontains]': q, 'filter[_or][1][email][_icontains]': q }
    : {}

  const { data } = await get(listOf(member), '/members', {
    ...fields(MEMBER_FIELDS),
    ...filter,
    'sort[0][fullName][direction]': 'asc',
    limit,
  })

  return data
}

const ROLE_LIMIT = 1000

/** The content of every policy on the user's roles in this workspace. */
export async function readUserPolicies(userId: Uuid): Promise<Array<JsonValue | undefined>> {
  const { data: roles } = await get(listOf(z.object({ roleId: z.string() })), '/system/user-role', {
    ...fields(['roleId']),
    'filter[userId][_eq]': userId,
    limit: ROLE_LIMIT,
  })

  if (roles.length === ROLE_LIMIT) throw new Error('Could not load all roles.')

  const policies = await Promise.all(
    roles.map(({ roleId }) =>
      get(
        listOf(z.object({ content: z.json().optional() })),
        `/roles/${encodeURIComponent(roleId)}/policies`,
      ),
    ),
  )

  return policies.flatMap(({ data }) => data.map((policy) => policy.content))
}
