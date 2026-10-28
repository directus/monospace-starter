import { linkOptions } from '@tanstack/react-router'

import type { ModuleSearch, SearchGroup, SearchHit } from '@/lib/modules/types'
import { monospace } from '@/lib/monospace'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { candidateSearchFilter, jobSearchFilter } from '@/modules/ats/data/home'
import { CandidateIcon, JobIcon } from '@/modules/ats/icons'

const LIMIT = 5

async function searchJobs(q: string): Promise<SearchHit[]> {
  const rows = await monospace.requisitions.readMany({
    fields: ['id', 'title', 'reqNumber', 'status'],
    include: { departments: { fields: ['name'] } },
    filter: jobSearchFilter(q),
    sort: [{ updatedAt: { direction: 'desc' } }],
    limit: LIMIT,
  })

  return rows.flatMap((row) =>
    row.id && row.title
      ? [
          {
            id: row.id,
            title: row.title,
            subtitle: [
              `REQ-${row.reqNumber}`,
              row.departments?.name,
              optionLabel('requisitionStatus', row.status),
            ]
              .filter(Boolean)
              .join(' · '),
            link: linkOptions({ to: '/ats/jobs/$jobId', params: { jobId: row.id } }),
          },
        ]
      : [],
  )
}

async function searchCandidates(q: string): Promise<SearchHit[]> {
  const rows = await monospace.candidates.readMany({
    fields: ['id', 'firstName', 'lastName', 'email'],
    filter: candidateSearchFilter(q),
    sort: [{ lastName: { direction: 'asc' } }, { firstName: { direction: 'asc' } }],
    limit: LIMIT,
  })

  return rows.flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            title: [row.firstName, row.lastName].filter(Boolean).join(' '),
            subtitle: row.email ?? undefined,
            variant: 'circle' as const,
            link: linkOptions({
              to: '/ats/candidates/$candidateId',
              params: { candidateId: row.id },
            }),
          },
        ]
      : [],
  )
}

const searchers = [
  { scopeId: 'candidates', search: searchCandidates },
  { scopeId: 'jobs', search: searchJobs },
] as const

export const atsSearch: ModuleSearch = {
  scopes: [
    {
      id: 'candidates',
      label: atsCopy.candidates.title,
      icon: CandidateIcon,
      list: (q) => linkOptions({ to: '/ats/candidates', search: { q } }),
    },
    {
      id: 'jobs',
      label: atsCopy.jobs.title,
      icon: JobIcon,
      list: (q) => linkOptions({ to: '/ats/jobs', search: { q } }),
    },
  ],
  async search(q, scopeId) {
    const groups = await Promise.all(
      searchers.flatMap(({ scopeId: id, search }) =>
        scopeId && id !== scopeId
          ? []
          : [search(q).then((hits): SearchGroup => ({ scopeId: id, hits }))],
      ),
    )

    return groups.filter((group) => group.hits.length > 0)
  },
}
