import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { patchCached, patchRow, refreshCrm } from './refresh'

describe('related record refresh', () => {
  it('refreshes nested record and file labels after a contact change', async () => {
    const client = new QueryClient()

    for (const group of [
      'contacts',
      'organizations',
      'deals',
      'activities',
      'attachments',
      'command-palette',
      'unrelated',
    ]) {
      client.setQueryData([group, 'example'], { label: 'Before' })
    }

    await refreshCrm(client)

    for (const group of [
      'contacts',
      'organizations',
      'deals',
      'activities',
      'attachments',
      'command-palette',
    ]) {
      expect(client.getQueryState([group, 'example'])?.isInvalidated).toBe(true)
    }

    expect(client.getQueryState(['unrelated', 'example'])?.isInvalidated).toBe(false)
  })

  it('refreshes board stages along with record queries after pipeline edits', async () => {
    const client = new QueryClient()
    client.setQueryData(['pipelineStages'], [])
    client.setQueryData(['deals', 'pages'], [])
    await refreshCrm(client, { pipelineStages: true })
    expect(client.getQueryState(['pipelineStages'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['deals', 'pages'])?.isInvalidated).toBe(true)
  })
})

describe('optimistic edits', () => {
  it('patches cached reads and puts them back when the write fails', async () => {
    const client = new QueryClient()

    const rows = [
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Second' },
    ]

    client.setQueryData(['deals', { q: '' }], rows)

    const rollback = await patchCached<typeof rows>(client, { queryKey: ['deals'] }, (data) =>
      patchRow(data, 'b', { title: 'Renamed' }),
    )

    expect(client.getQueryData(['deals', { q: '' }])).toEqual([
      { id: 'a', title: 'First' },
      { id: 'b', title: 'Renamed' },
    ])

    rollback()

    expect(client.getQueryData(['deals', { q: '' }])).toEqual(rows)
  })
})
