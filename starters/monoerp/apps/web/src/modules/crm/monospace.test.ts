import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { monospace } from '@/lib/monospace'

describe('Monospace browser client', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refreshes an expired session and retries the SDK request once', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const lockRequest = vi.fn(<T>(_name: string, callback: () => Promise<T>) => callback())
    vi.stubGlobal('navigator', { locks: { request: lockRequest } })

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ message: 'Invalid token' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: '00000000-0000-4000-8001-000000000001',
            email: 'admin@example.com',
            fullName: 'Example Admin',
            avatarId: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: '00000000-0000-4000-8001-000000000001' }] }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const organizations = await monospace.organizations.readMany({ fields: ['id'], limit: 1 })

    expect(organizations).toEqual([{ id: '00000000-0000-4000-8001-000000000001' }])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh')
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/system/users/me?fields=id,email,fullName,avatarId',
    )
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

    await Promise.all([
      monospace.organizations.readMany({ fields: ['id'], limit: 1 }),
      monospace.organizations.readMany({ fields: ['id'], limit: 1 }),
    ])

    expect(refreshRequests).toBe(1)
    expect(profileRequests).toBe(1)
    expect(itemRequests).toBe(4)
  })

  it('does not refresh permission failures', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'Forbidden' }, { status: 403 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      monospace.organizations.readMany({ fields: ['id'], limit: 1 }),
    ).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the original authentication failure when refresh is rejected', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ message: 'Expired session' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ message: 'Invalid token' }, { status: 401 }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      monospace.organizations.readMany({ fields: ['id'], limit: 1 }),
    ).rejects.toMatchObject({ message: 'Expired session', status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
