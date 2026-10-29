import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { patchCached, patchRow } from './query-cache'

describe('optimistic edits', () => {
  it('patches cached reads and puts them back when the write fails', async () => {
    const client = new QueryClient()

    const rows = [
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Second' },
    ]

    client.setQueryData(['records', { q: '' }], rows)

    const rollback = await patchCached<typeof rows>(client, { queryKey: ['records'] }, (data) =>
      patchRow(data, 'b', { title: 'Renamed' }),
    )

    expect(client.getQueryData(['records', { q: '' }])).toEqual([
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Renamed' },
    ])

    rollback()

    expect(client.getQueryData(['records', { q: '' }])).toEqual(rows)
  })
})
