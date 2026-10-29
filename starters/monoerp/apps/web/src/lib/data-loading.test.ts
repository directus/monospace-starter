import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectionPermissionsQuery } from '@/lib/permissions'

const userId = '00000000-0000-4000-8000-000000000001'

const ownerId = '00000000-0000-4000-8000-000000000002'

function requestUrl(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input), 'http://app')
}

// A fake Monospace answering the system reads these helpers make, counting each path.
function stubMonospace() {
  const paths: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input)
      paths.push(url.pathname)

      if (url.pathname.endsWith('/system/user-role')) {
        return Response.json({ data: [{ roleId: 'sales' }] })
      }

      if (url.pathname.endsWith('/policies')) {
        return Response.json({ data: [{ content: { access: 'admin' } }] })
      }

      if (url.pathname.endsWith('/members')) {
        return Response.json({
          data: [{ id: ownerId, fullName: 'Owner', email: 'owner@example.com', avatarId: null }],
        })
      }

      return Response.json({ message: `Unexpected ${url.pathname}` }, { status: 404 })
    }),
  )

  return paths
}

beforeEach(() => {
  vi.stubGlobal('window', {})
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('permissions', () => {
  it('reads the policies once for every collection a page checks', async () => {
    const paths = stubMonospace()
    const client = new QueryClient()

    const collections = ['organizations', 'contacts', 'deals', 'activities', 'attachments']

    const access = await Promise.all(
      collections.map((collection) => client.query(collectionPermissionsQuery(userId, collection))),
    )

    expect(access.every((item) => item.admin)).toBe(true)
    expect(paths.filter((path) => path.endsWith('/system/user-role'))).toHaveLength(1)
    expect(paths.filter((path) => path.endsWith('/policies'))).toHaveLength(1)
  })
})

describe('owners', () => {
  it('fills owners from the member list started with the app, without a lookup per read', async () => {
    const paths = stubMonospace()
    const { loadMembers, withUsers } = await import('@/lib/monospace-system')

    void loadMembers()

    const [first, second] = await Promise.all([
      withUsers([{ ownerUserId: ownerId }], { ownerUserId: 'owner' }),
      withUsers([{ ownerUserId: ownerId }, { ownerUserId: null }], { ownerUserId: 'owner' }),
    ])

    expect(first[0]?.owner?.fullName).toBe('Owner')
    expect(second.map((row) => row.owner?.fullName ?? null)).toEqual(['Owner', null])
    expect(paths.filter((path) => path.endsWith('/members'))).toHaveLength(1)
    expect(paths).toHaveLength(1)
  })

  it('makes no request for rows without owners', async () => {
    const paths = stubMonospace()
    const { withUsers } = await import('@/lib/monospace-system')

    await withUsers([{ ownerUserId: null }], { ownerUserId: 'owner' })

    expect(paths).toEqual([])
  })
})
