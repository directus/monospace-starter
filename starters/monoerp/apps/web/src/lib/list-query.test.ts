import { describe, expect, it } from 'vitest'

import { ALL_PAGE_SIZE, PAGE_SIZE, nextOffset, readAllPages, sortSpec } from './list-query'

describe('list queries', () => {
  it('reads every page in big pages, including an exact final page', async () => {
    const records = Array.from({ length: 1000 }, (_, id) => ({ id }))
    const offsets: Array<number> = []

    const rows = await readAllPages(async ({ offset = 0, limit = ALL_PAGE_SIZE }) => {
      offsets.push(offset)

      return records.slice(offset, offset + limit)
    })

    expect(rows).toEqual(records)
    expect(offsets).toEqual([0, 500, 1000])
  })

  it('stops after a short page and handles an empty collection', async () => {
    expect(await readAllPages(async () => [])).toEqual([])
    expect(nextOffset([1], [[1]])).toBeUndefined()
    expect(nextOffset(Array.from({ length: PAGE_SIZE }), [[], []])).toBe(100)
  })

  it('uses the fallback for missing or unknown columns', () => {
    const sorts = { name: (direction: 'asc' | 'desc') => `name:${direction}` }
    expect(sortSpec(sorts, null, 'default')).toBe('default')
    expect(sortSpec(sorts, { id: 'missing', desc: true }, 'default')).toBe('default')
    expect(sortSpec(sorts, { id: 'name', desc: true }, 'default')).toBe('name:desc')
  })
})
