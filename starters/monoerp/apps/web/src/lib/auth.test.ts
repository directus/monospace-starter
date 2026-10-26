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
