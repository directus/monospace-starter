// Reads for workforce planning, role requests, and approvals.
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import type { Uuid, roleRequestsReadManyArgs } from '@/generated/monospace'
import { PAGE_SIZE, nextOffset, sortSpec } from '@/lib/list-query'
import type { ListParams, Page, Sorts } from '@/lib/list-query'
import { keyed, monospace } from '@/lib/monospace'
import { usersById } from '@/lib/monospace-system'
import { withUsers } from '@/lib/monospace-system'

// Workforce plan

const PLAN_LINE_FIELDS = [
  'id',
  'planYear',
  'departmentId',
  'jobLevelId',
  'team',
  'roleName',
  'currentHeadcount',
  'plannedHeadcount',
  'approvedHeadcount',
  'hireType',
  'employmentType',
  'locations',
  'budgetAmount',
  'currency',
  'status',
  'createdAt',
  'updatedAt',
] as const

const APPROVAL_FIELDS = [
  'id',
  'step',
  'approverRole',
  'approverUserId',
  'decision',
  'note',
  'decidedAt',
  'createdAt',
] as const

async function fetchWorkforcePlan(year: number) {
  const rows = await monospace.workforcePlanRoles.readMany({
    fields: [...PLAN_LINE_FIELDS],
    filter: { planYear: year },
    include: {
      departments: { fields: ['id', 'name', 'headUserId', 'hasVariableComp'] },
      job_levels: { fields: ['id', 'name', 'position'] },
      approvals: {
        fields: [...APPROVAL_FIELDS],
        sort: [{ createdAt: { direction: 'asc' } }, { step: { direction: 'asc' } }],
        limit: 50,
      },
      // The overview counts what each line turned into: requests, their jobs, and who was hired.
      role_requests: {
        fields: ['id', 'status', 'numberOfHires'],
        limit: 50,
        include: {
          requisitions: {
            fields: ['id', 'status', 'numberOfHires'],
            include: {
              applications: { fields: ['id'], filter: { status: 'hired' }, limit: 50 },
            },
          },
        },
      },
    },
    sort: [{ roleName: { direction: 'asc' } }],
    limit: 500,
  })

  const lines = keyed(rows)
  const users = await usersById(lines.map((line) => line.departments?.headUserId))

  return lines.map((line) => ({
    ...line,
    departmentHead: line.departments?.headUserId
      ? (users.get(line.departments.headUserId) ?? null)
      : null,
    progress: planProgress(line),
  }))
}

type PlanLineForProgress = {
  plannedHeadcount?: number | null
  approvedHeadcount?: number | null
  role_requests?: {
    data: Array<{
      requisitions?: {
        status?: string | null
        numberOfHires?: number | null
        applications?: { data: Array<unknown> } | null
      } | null
    }>
  } | null
}

// Planned, approved, open, hired, and remaining for one plan line. A job with three hires and one
// hired counts two open; remaining is what's approved and not yet hired.
export function planProgress(line: PlanLineForProgress) {
  const planned = line.plannedHeadcount ?? 0
  const approved = line.approvedHeadcount ?? 0
  let open = 0
  let hired = 0

  for (const request of line.role_requests?.data ?? []) {
    const job = request.requisitions

    if (!job) continue
    const jobHired = job.applications?.data.length ?? 0
    hired += jobHired

    if (job.status === 'open' || job.status === 'on_hold') {
      open += Math.max((job.numberOfHires ?? 1) - jobHired, 0)
    }
  }

  return { planned, approved, open, hired, remaining: Math.max(approved - hired, 0) }
}

export type PlanLine = Awaited<ReturnType<typeof fetchWorkforcePlan>>[number]

export function workforcePlanQuery(year: number) {
  return queryOptions({
    queryKey: ['workforcePlanRoles', 'plan', year],
    queryFn: () => fetchWorkforcePlan(year),
  })
}

// Approved lines a hiring manager can request against, with what's already been requested.
async function fetchApprovedPlanLines() {
  const rows = await monospace.workforcePlanRoles.readMany({
    fields: [...PLAN_LINE_FIELDS],
    filter: { status: 'approved' },
    include: {
      departments: { fields: ['id', 'name', 'hasVariableComp'] },
      job_levels: { fields: ['id', 'name'] },
      role_requests: { fields: ['id', 'status', 'numberOfHires'], limit: 50 },
    },
    sort: [{ planYear: { direction: 'desc' } }, { roleName: { direction: 'asc' } }],
    limit: 500,
  })

  return keyed(rows)
}

export type ApprovedPlanLine = Awaited<ReturnType<typeof fetchApprovedPlanLines>>[number]

export function approvedPlanLinesQuery() {
  return queryOptions({
    queryKey: ['workforcePlanRoles', 'approved'],
    queryFn: fetchApprovedPlanLines,
  })
}

// Role requests

export type RoleRequestsFilter = NonNullable<roleRequestsReadManyArgs['filter']>

type RoleRequestSort = NonNullable<roleRequestsReadManyArgs['sort']>

const roleRequestSorts: Sorts<RoleRequestSort> = {
  roleName: (direction) => [{ roleName: { direction } }],
  status: (direction) => [{ status: { direction } }],
  urgency: (direction) => [{ urgency: { direction } }],
  numberOfHires: (direction) => [{ numberOfHires: { direction } }],
  createdAt: (direction) => [{ createdAt: { direction } }],
}

export function roleRequestSearchFilter(q: string): RoleRequestsFilter {
  return {
    _or: [{ roleName: { _icontains: q } }, { departments: { name: { _icontains: q } } }],
  }
}

async function fetchRoleRequests({
  q,
  filter,
  sort,
  offset = 0,
  limit = PAGE_SIZE,
}: ListParams<RoleRequestsFilter> & Page) {
  const rows = await monospace.roleRequests.readMany({
    fields: [
      'id',
      'roleName',
      'status',
      'urgency',
      'numberOfHires',
      'employmentType',
      'locations',
      'hiringReason',
      'workforcePlanRoleId',
      'requesterUserId',
      'hiringManagerUserId',
      'createdAt',
    ],
    include: {
      departments: { fields: ['id', 'name'] },
      job_levels: { fields: ['id', 'name'] },
      requisitions: { fields: ['id', 'reqNumber', 'status'] },
    },
    filter: { _and: [...(q ? [roleRequestSearchFilter(q)] : []), ...(filter ? [filter] : [])] },
    sort: sortSpec(roleRequestSorts, sort, [{ createdAt: { direction: 'desc' } }]),
    offset,
    limit,
  })

  return withUsers(keyed(rows), {
    requesterUserId: 'requesterUser',
    hiringManagerUserId: 'hiringManagerUser',
  })
}

export type RoleRequestRow = Awaited<ReturnType<typeof fetchRoleRequests>>[number]

export function roleRequestsPagesQuery(filters: ListParams<RoleRequestsFilter>) {
  return infiniteQueryOptions({
    queryKey: ['roleRequests', 'pages', filters],
    queryFn: ({ pageParam }) => fetchRoleRequests({ ...filters, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

async function fetchRoleRequestDetail(id: Uuid) {
  const detail = await monospace.roleRequests.readOne({
    key: id,
    fields: ['*'],
    include: {
      departments: { fields: ['id', 'name', 'hasVariableComp'] },
      job_levels: { fields: ['id', 'name', 'track'] },
      workforce_plan_roles: {
        fields: [
          'id',
          'planYear',
          'roleName',
          'team',
          'hireType',
          'approvedHeadcount',
          'budgetAmount',
          'currency',
        ],
      },
      requisitions: { fields: ['id', 'reqNumber', 'status', 'title', 'kickoffAt'] },
      approvals: {
        fields: [...APPROVAL_FIELDS],
        sort: [{ createdAt: { direction: 'asc' } }],
        limit: 50,
      },
    },
  })

  const [filled] = await withUsers([detail], {
    requesterUserId: 'requesterUser',
    hiringManagerUserId: 'hiringManagerUser',
    decidedByUserId: 'decidedByUser',
  })

  return {
    ...filled,
    approvals: {
      data: await withUsers(keyed(detail.approvals?.data ?? []), {
        approverUserId: 'approverUser',
      }),
    },
  }
}

export type RoleRequestDetail = Awaited<ReturnType<typeof fetchRoleRequestDetail>>

export function roleRequestDetailQuery(id: Uuid) {
  return queryOptions({
    queryKey: ['roleRequests', 'detail', id],
    queryFn: () => fetchRoleRequestDetail(id),
  })
}

// Approvals

export type ApprovalsView = 'pending' | 'decided'

const SIBLING_APPROVALS = {
  fields: ['id', 'step', 'decision', 'approverRole', 'createdAt'],
  sort: [{ createdAt: { direction: 'asc' } }, { step: { direction: 'asc' } }],
  limit: 50,
} as const

async function fetchApprovals(view: ApprovalsView) {
  const rows = await monospace.approvals.readMany({
    fields: [...APPROVAL_FIELDS, 'workforcePlanRoleId', 'roleRequestId', 'offerId'],
    filter: view === 'pending' ? { decision: 'pending' } : { decision: { _neq: 'pending' } },
    include: {
      workforce_plan_roles: {
        fields: [...PLAN_LINE_FIELDS],
        include: {
          departments: { fields: ['id', 'name'] },
          job_levels: { fields: ['id', 'name'] },
          approvals: { ...SIBLING_APPROVALS, fields: [...SIBLING_APPROVALS.fields] },
        },
      },
      role_requests: {
        fields: [
          'id',
          'roleName',
          'status',
          'urgency',
          'urgencyImpact',
          'numberOfHires',
          'employmentType',
          'locations',
          'hiringReason',
          'businessJustification',
          'compMin',
          'compMax',
          'currency',
          'requesterUserId',
          'hiringManagerUserId',
          'workforcePlanRoleId',
          'createdAt',
        ],
        include: {
          departments: { fields: ['id', 'name', 'hasVariableComp'] },
          job_levels: { fields: ['id', 'name'] },
          workforce_plan_roles: { fields: ['id', 'budgetAmount', 'currency', 'planYear'] },
        },
      },
      offers: {
        fields: ['id', 'status', 'baseSalary', 'currency', 'equityUnits', 'proposedStartDate'],
        include: {
          applications: {
            fields: ['id'],
            include: {
              candidates: { fields: ['id', 'firstName', 'lastName', 'city', 'country'] },
              requisitions: {
                fields: ['id', 'reqNumber', 'title', 'compMin', 'compMax', 'currency'],
                include: { departments: { fields: ['id', 'name'] } },
              },
            },
          },
          approvals: { ...SIBLING_APPROVALS, fields: [...SIBLING_APPROVALS.fields] },
        },
      },
    },
    sort:
      view === 'pending'
        ? [{ createdAt: { direction: 'asc' } }, { step: { direction: 'asc' } }]
        : [{ decidedAt: { direction: 'desc' } }],
    limit: view === 'pending' ? 200 : 100,
  })

  const approvals = keyed(rows)

  const users = await usersById(
    approvals.flatMap((approval) => [
      approval.approverUserId,
      approval.role_requests?.requesterUserId,
      approval.role_requests?.hiringManagerUserId,
    ]),
  )

  const user = (id: Uuid | null | undefined) => (id ? (users.get(id) ?? null) : null)

  return approvals.map((approval) => ({
    ...approval,
    approverUser: user(approval.approverUserId),
    requesterUser: user(approval.role_requests?.requesterUserId),
    hiringManagerUser: user(approval.role_requests?.hiringManagerUserId),
    waitingOn: waitingOn(approval),
  }))
}

type Sibling = {
  step?: number | null
  decision?: string | null
  approverRole?: string | null
  createdAt?: string | null
}

// Steps run in order: a later step waits until every earlier one in the same round is approved.
// The round is the run of steps created with this one (a resubmission starts a new round).
function waitingOn(
  approval: Sibling & {
    workforce_plan_roles?: { approvals?: { data: Array<Sibling> } | null } | null
    offers?: { approvals?: { data: Array<Sibling> } | null } | null
  },
) {
  const siblings =
    approval.workforce_plan_roles?.approvals?.data ?? approval.offers?.approvals?.data ?? []

  const round = siblings.filter((sibling) => sibling.createdAt === approval.createdAt)

  const blocking = round.find(
    (sibling) => (sibling.step ?? 0) < (approval.step ?? 0) && sibling.decision !== 'approved',
  )

  return blocking?.approverRole ?? null
}

export type ApprovalRow = Awaited<ReturnType<typeof fetchApprovals>>[number]

export function approvalsQuery(view: ApprovalsView) {
  return queryOptions({
    queryKey: ['approvals', view],
    queryFn: () => fetchApprovals(view),
  })
}
