import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { dealsQuery } from './data'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('board and dashboard deals', () => {
  it('fetches all matching deals through the SDK, beyond the old 250-row cap', async () => {
    vi.stubGlobal('window', {})
    let offset = 0

    const request = vi.fn<typeof fetch>(async () => {
      const count = Math.min(50, 300 - offset)

      const data = Array.from({ length: count }, (_, index) => ({
        id: `00000000-0000-4000-8007-${String(offset + index + 1).padStart(12, '0')}`,
        title: `Deal ${offset + index + 1}`,
        ownerUserId: null,
      }))

      offset += count

      return Response.json({ data })
    })

    vi.stubGlobal('fetch', request)

    const rows = await new QueryClient().fetchQuery(dealsQuery({}))
    expect(rows).toHaveLength(300)
    expect(rows.at(-1)?.title).toBe('Deal 300')
    expect(request).toHaveBeenCalledTimes(7)
  })
})
