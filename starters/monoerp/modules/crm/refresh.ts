import type { QueryClient } from '@tanstack/react-query'

import { commandPaletteKey } from '@/shell/query-keys'

// Record labels appear in details, activity, attachments, and search results.
const recordKeys = ['organizations', 'contacts', 'deals', 'activities', 'attachments']

export function refreshCrm(queryClient: QueryClient, { pipelineStages = false } = {}) {
  const keys = [...recordKeys.map((key) => [key]), commandPaletteKey]

  if (pipelineStages) keys.push(['pipelineStages'])

  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
