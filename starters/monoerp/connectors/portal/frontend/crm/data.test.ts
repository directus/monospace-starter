import { describe, expect, it } from 'vitest'

import { portalSummariesQuery } from './data'

describe('portal summaries', () => {
  it('reuses the cached read for the same accounts in any order', () => {
    expect(portalSummariesQuery(['b', null, 'a', 'b']).queryKey).toEqual(
      portalSummariesQuery(['a', 'b', undefined]).queryKey,
    )
  })
})
