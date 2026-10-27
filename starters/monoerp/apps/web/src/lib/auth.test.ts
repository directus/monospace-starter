import { afterEach, describe, expect, it, vi } from 'vitest'

import { refreshSession } from './auth'

describe('Monospace authentication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads the signed-in user after refreshing the session', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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

    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshSession()).resolves.toEqual({
      id: '00000000-0000-4000-8001-000000000001',
      email: 'admin@example.com',
      fullName: 'Example Admin',
      avatarId: null,
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/system/users/me?fields=id,email,fullName,avatarId',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})

describe('session start', () => {
  const user = {
    id: '00000000-0000-4000-8001-000000000001',
    email: 'admin@example.com',
    fullName: 'Example Admin',
    avatarId: null,
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refreshes the session and reads the user at the same time', async () => {
    const started: string[] = []
    let finishRefresh = () => {}

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const url = input instanceof Request ? input.url : String(input)
        started.push(url)

        if (url.endsWith('/auth/refresh')) {
          await new Promise<void>((resolve) => {
            finishRefresh = resolve
          })

          return Response.json({})
        }

        return Response.json({ data: user })
      }),
    )

    const session = refreshSession()

    await vi.waitFor(() => expect(started).toHaveLength(2))
    finishRefresh()

    await expect(session).resolves.toEqual(user)
    expect(started).toHaveLength(2)
  })

  it('reads the user again when the old access token had expired', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ message: 'Expired' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ data: user }))

    vi.stubGlobal('fetch', fetchMock)

    await expect(refreshSession()).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses the requests the page head started, once', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ data: user }))

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', {
      __sessionStart: {
        refresh: Promise.resolve(Response.json({})),
        user: Promise.resolve(Response.json({ data: user })),
      },
    })

    await expect(refreshSession()).resolves.toEqual(user)
    expect(fetchMock).not.toHaveBeenCalled()

    await refreshSession()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
