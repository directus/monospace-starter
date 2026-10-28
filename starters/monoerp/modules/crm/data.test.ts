import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { dealsQuery } from './data'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('board and dashboard deals', () => {
  it('fetches all matching deals through the SDK in as few pages as it can', async () => {
    vi.stubGlobal('window', {})
    const total = 1200
    let offset = 0

    const request = vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      const limit = Number(new URL(url, 'http://app').searchParams.get('limit'))
      const count = Math.min(limit, total - offset)

      const data = Array.from({ length: count }, (_, index) => ({
        id: `00000000-0000-4000-8007-${String(offset + index + 1).padStart(12, '0')}`,
        title: `Deal ${offset + index + 1}`,
        ownerUserId: null,
      }))

      offset += count

      return Response.json({ data })
    })

    vi.stubGlobal('fetch', request)

    const rows = await new QueryClient().query(dealsQuery({}))
    expect(rows).toHaveLength(total)
    expect(rows.at(-1)?.title).toBe(`Deal ${total}`)
    expect(request).toHaveBeenCalledTimes(3)
  })
})
