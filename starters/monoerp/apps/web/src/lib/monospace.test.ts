import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { authenticatedHttp } from '@/lib/monospace-http'

const http = authenticatedHttp({ url: '', workspace: 'test-workspace', credentials: 'include' })

async function readExample() {
  const response = await http.request({
    method: 'GET',
    path: '/items/example',
    query: { limit: 1 },
    headers: new Headers(),
  })

  return z.object({ data: z.array(z.object({ id: z.string() })) }).parse(response).data
}

describe('Monospace browser transport', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refreshes an expired session and retries the collection request once', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const lockRequest = vi.fn(<T>(_name: string, callback: () => Promise<T>) => callback())
    vi.stubGlobal('navigator', { locks: { request: lockRequest } })

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ message: 'Invalid token' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: '00000000-0000-4000-8001-000000000001' }] }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const rows = await readExample()

    expect(rows).toEqual([{ id: '00000000-0000-4000-8001-000000000001' }])
    // The retry only needs a new token, so it doesn't read the profile.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh')
    expect(timeout).toHaveBeenCalledWith(30_000)
    expect(lockRequest).toHaveBeenCalledWith('monospace-session-refresh', expect.any(Function))
  })

  it('shares one refresh across concurrent expired requests', async () => {
    let itemRequests = 0
    let refreshRequests = 0
    let profileRequests = 0

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : String(input)

      if (url === '/api/auth/refresh') {
        refreshRequests += 1

        return Response.json({})
      }

      if (url.startsWith('/api/system/users/me')) {
        profileRequests += 1

        return Response.json({
          data: {
            id: '00000000-0000-4000-8001-000000000001',
            email: 'admin@example.com',
            fullName: 'Example Admin',
            avatarId: null,
          },
        })
      }

      itemRequests += 1

      if (itemRequests <= 2) {
        return Response.json({ message: 'Invalid token' }, { status: 401 })
      }

      return Response.json({ data: [{ id: '00000000-0000-4000-8001-000000000001' }] })
    })

    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([readExample(), readExample()])

    expect(refreshRequests).toBe(1)
    expect(profileRequests).toBe(0)
    expect(itemRequests).toBe(4)
  })

  it('does not refresh permission failures', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(readExample()).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the original authentication failure when refresh is rejected', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ message: 'Expired session' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ message: 'Invalid token' }, { status: 401 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(readExample()).rejects.toMatchObject({ message: 'Expired session', status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
