// Reads for interviews, scorecards, and offers.
import { queryOptions } from '@tanstack/react-query'

import type { Uuid, interviewsReadManyArgs } from '@/generated/monospace'
import { keyed, monospace } from '@/lib/monospace'
import { usersById } from '@/lib/monospace-system'

const INTERVIEW_LIMIT = 200

type InterviewsFilter = NonNullable<interviewsReadManyArgs['filter']>

async function fetchInterviews(filter: InterviewsFilter, direction: 'asc' | 'desc') {
  const rows = await monospace.interviews.readMany({
    fields: [
      'id',
      'applicationId',
      'interviewStageId',
      'title',
      'startsAt',
      'endsAt',
      'meetingUrl',
      'status',
    ],
    include: {
      applications: {
        fields: ['id', 'candidateId', 'requisitionId'],
        include: {
          candidates: { fields: ['id', 'firstName', 'lastName', 'email'] },
          requisitions: { fields: ['id', 'title', 'reqNumber'] },
        },
      },
      interview_stages: { fields: ['id', 'name', 'kind'] },
      interview_participants: { fields: ['id', 'userId'], limit: 50 },
      scorecards: {
        fields: [
          'id',
          'interviewerUserId',
          'recommendation',
          'summary',
          'positives',
          'flags',
          'submittedAt',
          'updatedAt',
        ],
        limit: 50,
      },
    },
    filter,
    sort: [{ startsAt: { direction } }],
    limit: INTERVIEW_LIMIT,
  })

  const interviews = keyed(rows)

  const users = await usersById(
    interviews.flatMap((row) => [
      ...(row.interview_participants?.data ?? []).map((participant) => participant.userId),
      ...(row.scorecards?.data ?? []).map((scorecard) => scorecard.interviewerUserId),
    ]),
  )

  const user = (id: Uuid | null | undefined) => (id ? (users.get(id) ?? null) : null)

  return interviews.map((row) => ({
    ...row,
    participants: (row.interview_participants?.data ?? []).flatMap((participant) =>
      participant.userId ? [{ userId: participant.userId, user: user(participant.userId) }] : [],
    ),
    scorecards: keyed(row.scorecards?.data ?? []).map((scorecard) => ({
      ...scorecard,
      interviewer: user(scorecard.interviewerUserId),
    })),
  }))
}

export type InterviewRow = Awaited<ReturnType<typeof fetchInterviews>>[number]

export type ScorecardRow = InterviewRow['scorecards'][number]

export function candidateInterviewsQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['interviews', 'candidate', candidateId],
    queryFn: () => fetchInterviews({ applications: { candidateId } }, 'desc'),
  })
}

const WEEK_MS = 7 * 86_400_000

// Upcoming: from the start of today through the next 7 days. Owed: interviews that have started,
// weren't cancelled, and are missing a scorecard (from me, or from anyone for "all").
export function interviewsBoardQuery(userId: Uuid | null) {
  return queryOptions({
    queryKey: ['interviews', 'board', userId],
    queryFn: async () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const now = new Date().toISOString()
      const mine: InterviewsFilter = userId ? { interview_participants: { userId } } : {}

      const pastFilter: InterviewsFilter = {
        ...mine,
        status: { _neq: 'cancelled' },
        startsAt: { _lt: now },
      }

      if (userId) pastFilter.scorecards = { _none: { interviewerUserId: userId } }

      const [upcoming, past] = await Promise.all([
        fetchInterviews(
          {
            ...mine,
            startsAt: {
              _gte: start.toISOString(),
              _lt: new Date(start.getTime() + WEEK_MS).toISOString(),
            },
          },
          'asc',
        ),
        fetchInterviews(pastFilter, 'desc'),
      ])

      const owed = past.filter((row) =>
        userId
          ? true
          : row.participants.some(
              (participant) =>
                !row.scorecards.some((card) => card.interviewerUserId === participant.userId),
            ),
      )

      return { upcoming, owed }
    },
  })
}

// The candidate's jobs and each job's interview plan, for the schedule form.
async function fetchCandidateApplications(candidateId: Uuid) {
  const rows = await monospace.applications.readMany({
    fields: ['id', 'status', 'interviewStageId', 'requisitionId'],
    include: {
      candidates: { fields: ['id', 'firstName', 'lastName', 'email'] },
      requisitions: {
        fields: ['id', 'title', 'reqNumber'],
        include: {
          interview_stages: {
            fields: ['id', 'name', 'kind', 'position'],
            sort: [{ position: { direction: 'asc' } }],
            limit: 50,
          },
        },
      },
    },
    filter: { candidateId },
    sort: [{ appliedAt: { direction: 'desc' } }],
    limit: 50,
  })

  return keyed(rows).map((row) => ({
    ...row,
    stages: keyed(row.requisitions?.interview_stages?.data ?? []),
  }))
}

export type CandidateApplication = Awaited<ReturnType<typeof fetchCandidateApplications>>[number]

export function candidateApplicationsQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['applications', 'candidate', candidateId, 'interview-plan'],
    queryFn: () => fetchCandidateApplications(candidateId),
  })
}

export async function fetchEmailTemplate(name: string) {
  const [template] = await monospace.emailTemplates.readMany({
    fields: ['id', 'subject', 'body'],
    filter: { name },
    limit: 1,
  })

  return template ?? null
}

async function fetchOffer(applicationId: Uuid) {
  const application = await monospace.applications.readOne({
    key: applicationId,
    fields: ['id', 'status', 'interviewStageId', 'requisitionId', 'candidateId'],
    include: {
      candidates: { fields: ['id', 'firstName', 'lastName', 'city', 'country'] },
      interview_stages: { fields: ['id', 'name', 'kind'] },
      requisitions: {
        fields: [
          'id',
          'title',
          'employmentType',
          'compMin',
          'compMax',
          'currency',
          'hiringManagerUserId',
        ],
        include: {
          departments: { fields: ['id', 'name', 'headUserId'] },
          job_levels: { fields: ['id', 'name'] },
          role_requests: {
            fields: ['id', 'approvedBaseMin', 'approvedBaseMax', 'approvedCurrency'],
          },
          interview_stages: {
            fields: ['id', 'name', 'kind', 'position'],
            sort: [{ position: { direction: 'asc' } }],
            limit: 50,
          },
        },
      },
      offers: {
        fields: [
          'id',
          'status',
          'baseSalary',
          'currency',
          'equityUnits',
          'proposedStartDate',
          'candidateIntro',
          'searchOverview',
          'updatedAt',
        ],
        include: {
          approvals: {
            fields: [
              'id',
              'step',
              'approverRole',
              'approverUserId',
              'decision',
              'decidedAt',
              'note',
            ],
            sort: [{ step: { direction: 'asc' } }],
            limit: 20,
          },
        },
      },
    },
  })

  const approvals = keyed(application.offers?.approvals?.data ?? [])
  const users = await usersById(approvals.map((approval) => approval.approverUserId))

  return {
    ...application,
    approvals: approvals.map((approval) => ({
      ...approval,
      approver: approval.approverUserId ? (users.get(approval.approverUserId) ?? null) : null,
    })),
  }
}

export type OfferDetail = Awaited<ReturnType<typeof fetchOffer>>

export type OfferApproval = OfferDetail['approvals'][number]

export function offerQuery(applicationId: Uuid) {
  return queryOptions({
    queryKey: ['offers', 'application', applicationId],
    queryFn: () => fetchOffer(applicationId),
  })
}

// Background checks come from the read-only Checkr source, matched by email. Monospace can't draw
// a relation into an extension source without making `candidates.email` a required link, so this
// is its own read instead of an include on the candidate.
async function fetchCheckrCandidates(emails: ReadonlyArray<string>) {
  const rows = await monospace.checkrCandidates.readMany({
    fields: ['id', 'firstName', 'lastName', 'email', 'adjudication', 'createdAt'],
    filter: { email: { _in: [...emails] } },
    include: {
      reports: {
        fields: [
          'id',
          'status',
          'result',
          'adjudication',
          'assessment',
          'package',
          'turnaroundTime',
          'createdAt',
          'completedAt',
          'estimatedCompletionTime',
        ],
        limit: 20,
      },
      invitations: {
        fields: [
          'id',
          'status',
          'package',
          'invitationUrl',
          'createdAt',
          'expiresAt',
          'completedAt',
        ],
        limit: 20,
      },
    },
    limit: 50,
  })

  const newestFirst = <T extends { createdAt?: string | null }>(items: Array<T>) =>
    [...items].sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))

  return withCheckrIds(rows).map((row) => ({
    ...row,
    reports: newestFirst(withCheckrIds(row.reports?.data ?? [])),
    invitations: newestFirst(withCheckrIds(row.invitations?.data ?? [])),
  }))
}

// keyed() for Checkr, whose ids are strings like "cand_…" rather than uuids.
function withCheckrIds<T extends { id?: string | null }>(rows: ReadonlyArray<T>) {
  return rows.flatMap((row) => (row.id ? [{ ...row, id: row.id }] : []))
}

export type CheckrCandidate = Awaited<ReturnType<typeof fetchCheckrCandidates>>[number]

export function checkrCandidateQuery(email: string) {
  return queryOptions({
    queryKey: ['checkrCandidates', 'email', email.toLowerCase()],
    queryFn: async () => (await fetchCheckrCandidates([email.toLowerCase()]))[0] ?? null,
    retry: false,
  })
}

export function checkrPackagesQuery() {
  return queryOptions({
    queryKey: ['checkrPackages'],
    queryFn: async () =>
      withCheckrIds(
        await monospace.checkrPackages.readMany({
          fields: ['id', 'name', 'slug', 'price'],
          limit: 100,
        }),
      ),
    staleTime: 10 * 60_000,
    retry: false,
  })
}
