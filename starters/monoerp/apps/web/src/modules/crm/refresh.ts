import type { QueryClient } from '@tanstack/react-query'

type Group =
  | 'organizations'
  | 'contacts'
  | 'contactOrganizations'
  | 'opportunities'
  | 'interactions'
  | 'attachments'
  | 'pipelineStages'

// These collections are embedded in record details, activity, attachments, and search results.
const records = [
  'organizations',
  'contacts',
  'opportunities',
  'interactions',
  'attachments',
  'command-palette',
]

const REFRESHES: Record<Group, ReadonlyArray<string>> = {
  organizations: records,
  contacts: records,
  contactOrganizations: records,
  opportunities: records,
  interactions: records,
  attachments: records,
  pipelineStages: [...records, 'pipelineStages'],
}

export function refreshCrm(queryClient: QueryClient, group: Group) {
  return Promise.all(
    REFRESHES[group].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  )
}
