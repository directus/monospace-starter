// Reads for the public careers site. Signed-out visitors read through Monospace's public role,
// which only allows open, externally posted, non-confidential jobs and these fields
// (modules/ats/infra/monospace/setup/ats-public.mjs). Ask for nothing more, or the public read fails.
import { MonospaceError, MonospacePermissionError } from '@monospace/sdk'
import { queryOptions } from '@tanstack/react-query'

import type { Uuid } from '@/generated/monospace'
import { keyed, monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'

const JOB_FIELDS = [
  'id',
  'reqNumber',
  'title',
  'employmentType',
  'locations',
  'description',
  'status',
  'isConfidential',
  'postExternally',
  'openedAt',
] as const

const postedFilter = {
  status: 'open',
  postExternally: true,
  isConfidential: false,
} as const

async function fetchCareerJobs() {
  const rows = await monospace.requisitions.readMany({
    fields: [...JOB_FIELDS],
    include: { departments: { fields: ['id', 'name'] } },
    filter: postedFilter,
    sort: [{ title: { direction: 'asc' } }],
    limit: 200,
  })

  return keyed(rows)
}

export type CareerJob = Awaited<ReturnType<typeof fetchCareerJobs>>[number]

export function careerJobsQuery() {
  return queryOptions({ queryKey: ['requisitions', 'careers'], queryFn: fetchCareerJobs })
}

// Null when the job isn't posted: closed, confidential, internal only, or gone. A signed-in
// teammate could read those, so the posted rules are checked here too, not only by the policy.
async function fetchCareerJob(id: Uuid) {
  const rows = await monospace.requisitions.readMany({
    fields: [...JOB_FIELDS],
    include: { departments: { fields: ['id', 'name'] } },
    filter: { ...postedFilter, id },
    limit: 1,
  })

  return keyed(rows)[0] ?? null
}

export function careerJobQuery(id: Uuid) {
  return queryOptions({
    queryKey: ['requisitions', 'careers', id],
    queryFn: () => fetchCareerJob(id),
  })
}

// "Europe, AMER East" is two locations.
export function jobLocations(job: Pick<CareerJob, 'locations'>) {
  return (job.locations ?? '')
    .split(',')
    .map((location) => location.trim())
    .filter(Boolean)
}

export function careerErrorMessage(error: Error, fallback: string) {
  if (
    error instanceof MonospacePermissionError ||
    (error instanceof MonospaceError && error.status === 403)
  ) {
    return atsCopy.careers.notEnabled
  }

  return fallback
}
