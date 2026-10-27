import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { refreshCrm } from './refresh'

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
