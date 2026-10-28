// Reads for jobs (requisitions), their interview plan, and the pipeline of applications on them.
import { queryOptions } from '@tanstack/react-query'

import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid, requisitionsReadManyArgs } from '@/generated/monospace'
import { PAGE_SIZE, pagesQuery } from '@/lib/list-query'
import { sortSpec } from '@/lib/list-query'
import type { ListParams, Page, Sorts } from '@/lib/list-query'
import { keyed, monospace } from '@/lib/monospace'
import { withUsers } from '@/lib/monospace-system'

export type JobsFilter = NonNullable<requisitionsReadManyArgs['filter']>

type JobSort = NonNullable<requisitionsReadManyArgs['sort']>

const DAY_MS = 86_400_000

// An application with no activity for this long needs attention, unless its stage sets an SLA.
export const STALE_DAYS = 3

const JOB_SORTS = {
  reqNumber: (direction) => [{ reqNumber: { direction } }],
  title: (direction) => [{ title: { direction } }],
  status: (direction) => [{ status: { direction } }],
  urgency: (direction) => [{ urgency: { direction } }],
  openings: (direction) => [{ numberOfHires: { direction } }],
  age: (direction) => [{ createdAt: { direction: direction === 'asc' ? 'desc' : 'asc' } }],
} satisfies Sorts<JobSort>

export function jobSearchFilter(q: string) {
  const number = Number(q.replace(/^req-?/i, ''))

  return {
    _or: [
      { title: { _icontains: q } },
      { locations: { _icontains: q } },
      { departments: { name: { _icontains: q } } },
      ...(Number.isInteger(number) && number > 0 ? [{ reqNumber: number }] : []),
    ],
  }
}

export function reqLabel(reqNumber: number | null | undefined) {
  return reqNumber ? `REQ-${reqNumber}` : ''
}

// Locations are stored as one comma-separated text column.
export function splitLocations(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function joinLocations(values: ReadonlyArray<string>) {
  return values.length ? values.join(', ') : null
}

async function fetchJobs({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = PAGE_SIZE,
}: ListParams<JobsFilter> & Page) {
  const rows = await monospace.requisitions.readMany({
    fields: [
      'id',
      'reqNumber',
      'title',
      'status',
      'urgency',
      'numberOfHires',
      'locations',
      'hiringManagerUserId',
      'recruiterUserId',
      'createdAt',
      'openedAt',
    ],
    include: {
      departments: { fields: ['id', 'name'] },
      job_levels: { fields: ['id', 'name'] },
      applications: {
        fields: ['id', 'appliedAt'],
        filter: { status: 'active' },
        limit: 1000,
      },
    },
    filter: { _and: [...(q ? [jobSearchFilter(q)] : []), ...(filter ? [filter] : [])] },
    sort: sortSpec<JobSort>(JOB_SORTS, sort, [{ reqNumber: { direction: 'desc' } }]),
    offset,
    limit,
  })

  const weekAgo = Date.now() - 7 * DAY_MS

  const jobs = keyed(rows).map(({ applications, ...row }) => {
    const active = applications?.data ?? []

    return {
      ...row,
      activeCount: active.length,
      newCount: active.filter((app) => app.appliedAt && Date.parse(app.appliedAt) >= weekAgo)
        .length,
    }
  })

  return withUsers(jobs, {
    hiringManagerUserId: 'hiringManagerUser',
    recruiterUserId: 'recruiterUser',
  })
}

export type JobRow = Awaited<ReturnType<typeof fetchJobs>>[number]

export function jobsPagesQuery(filters: ListParams<JobsFilter>) {
  return pagesQuery(['requisitions', 'pages', filters], (page) =>
    fetchJobs({ ...filters, ...page }),
  )
}

async function fetchJobDetail(jobId: Uuid) {
  const detail = await monospace.requisitions.readOne({
    key: jobId,
    fields: [
      'id',
      'reqNumber',
      'title',
      'status',
      'departmentId',
      'jobLevelId',
      'hiringManagerUserId',
      'recruiterUserId',
      'employmentType',
      'numberOfHires',
      'locations',
      'hiringReason',
      'urgency',
      'compMin',
      'compMax',
      'currency',
      'description',
      'isConfidential',
      'postExternally',
      'isLeadership',
      'teamSize',
      'mustHaveSkills',
      'niceToHaveSkills',
      'kickoffNotes',
      'kickoffAt',
      'openedAt',
      'closedAt',
      'roleRequestId',
      'createdById',
      'updatedById',
      'createdAt',
      'updatedAt',
    ],
    include: {
      departments: { fields: ['id', 'name'] },
      job_levels: { fields: ['id', 'name'] },
      role_requests: {
        fields: [
          'id',
          'roleName',
          'status',
          'approvedBaseMin',
          'approvedBaseMax',
          'approvedVariableMin',
          'approvedVariableMax',
          'approvedCurrency',
          'approvedEquityUnits',
          'decidedAt',
        ],
      },
      interview_stages: {
        fields: ['id', 'name', 'kind', 'position', 'slaDays'],
        sort: [{ position: { direction: 'asc' } }],
        limit: 100,
      },
    },
  })

  const [job] = await withUsers([detail], {
    hiringManagerUserId: 'hiringManagerUser',
    recruiterUserId: 'recruiterUser',
    createdById: 'createdBy',
    updatedById: 'updatedBy',
  })

  return { ...job, id: jobId, interview_stages: keyed(detail.interview_stages?.data ?? []) }
}

export type JobDetail = Awaited<ReturnType<typeof fetchJobDetail>>

export type InterviewStage = JobDetail['interview_stages'][number]

export function jobDetailQuery(jobId: Uuid) {
  return queryOptions({
    queryKey: ['requisitions', 'detail', jobId],
    queryFn: () => fetchJobDetail(jobId),
  })
}

// Every application on the job, with what a pipeline card shows: the candidate, and the
// scorecards from its interviews (latest first) for the recommendation chip.
async function fetchJobPipeline(jobId: Uuid) {
  const rows = await monospace.applications.readMany({
    fields: [
      'id',
      'requisitionId',
      'status',
      'rejectionReason',
      'interviewStageId',
      'stageEnteredAt',
      'lastActivityAt',
      'appliedAt',
      'updatedAt',
    ],
    include: {
      candidates: { fields: ['id', 'firstName', 'lastName', 'email', 'source', 'city', 'country'] },
      interviews: {
        fields: ['id', 'startsAt', 'status'],
        include: {
          scorecards: {
            fields: ['id', 'recommendation', 'submittedAt', 'interviewerUserId'],
            limit: 20,
          },
          interview_participants: { fields: ['id', 'userId'], limit: 20 },
        },
        sort: [{ startsAt: { direction: 'desc' } }],
        limit: 50,
      },
      offers: {
        fields: ['id', 'status'],
        include: { approvals: { fields: ['id', 'decision'], limit: 10 } },
      },
    },
    filter: { requisitionId: jobId },
    sort: [{ stageEnteredAt: { direction: 'asc' } }],
    limit: 2000,
  })

  return keyed(rows).map(({ interviews, offers, ...row }) => {
    const approvals = offers?.approvals?.data ?? []

    const scorecards = (interviews?.data ?? [])
      .flatMap((interview) => interview.scorecards?.data ?? [])
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))

    const interviewerIds = (interviews?.data ?? []).flatMap((interview) =>
      (interview.interview_participants?.data ?? []).flatMap((participant) =>
        participant.userId ? [participant.userId] : [],
      ),
    )

    const upcoming = (interviews?.data ?? [])
      .filter(
        (interview) =>
          interview.status === 'scheduled' &&
          interview.startsAt &&
          Date.parse(interview.startsAt) > Date.now(),
      )
      .at(-1)

    return {
      ...row,
      latestRecommendation: scorecards[0]?.recommendation ?? null,
      scorecardCount: scorecards.length,
      nextInterviewAt: upcoming?.startsAt ?? null,
      interviewerIds,
      offer: offers?.id
        ? {
            id: offers.id,
            status: offers.status ?? 'draft',
            approved: approvals.filter((approval) => approval.decision === 'approved').length,
            steps: approvals.length,
          }
        : null,
    }
  })
}

export type PipelineApplication = Awaited<ReturnType<typeof fetchJobPipeline>>[number]

export function jobPipelineQuery(jobId: Uuid) {
  return queryOptions({
    queryKey: ['applications', 'pipeline', jobId],
    queryFn: () => fetchJobPipeline(jobId),
  })
}

export function daysSince(value: string | null | undefined, now = Date.now()) {
  return value ? Math.max(0, Math.floor((now - Date.parse(value)) / DAY_MS)) : 0
}

// Over the stage's SLA, or quiet for STALE_DAYS when the stage has none.
export function needsAttention(
  application: Pick<PipelineApplication, 'stageEnteredAt' | 'lastActivityAt' | 'status'>,
  stage: Pick<InterviewStage, 'slaDays'> | undefined,
  now = Date.now(),
) {
  if (application.status !== 'active') return false
  const sla = stage?.slaDays

  if (sla != null && daysSince(application.stageEnteredAt, now) > sla) return true

  return daysSince(application.lastActivityAt, now) >= STALE_DAYS
}

// Approved role requests that haven't been turned into a job yet: the "From role request" list
// under New job.
async function fetchRequestsWithoutJob() {
  const rows = await monospace.roleRequests.readMany({
    fields: ['id', 'roleName', 'numberOfHires', 'decidedAt'],
    include: {
      departments: { fields: ['id', 'name'] },
      requisitions: { fields: ['id'] },
    },
    filter: { status: 'approved' },
    sort: [{ decidedAt: { direction: 'desc' } }],
    limit: 100,
  })

  return keyed(rows).filter((row) => !row.requisitions?.id)
}

export type RequestWithoutJob = Awaited<ReturnType<typeof fetchRequestsWithoutJob>>[number]

export function requestsWithoutJobQuery() {
  return queryOptions({
    queryKey: ['roleRequests', 'withoutJob'],
    queryFn: fetchRequestsWithoutJob,
  })
}

export async function lookupJobs(q: string): Promise<Array<RelationOption>> {
  const rows = await monospace.requisitions.readMany({
    fields: ['id', 'reqNumber', 'title'],
    filter: q ? jobSearchFilter(q) : undefined,
    sort: [{ reqNumber: { direction: 'desc' } }],
    limit: 20,
  })

  return keyed(rows).map((row) => ({
    value: row.id,
    label: row.title ?? '',
    description: reqLabel(row.reqNumber),
  }))
}
