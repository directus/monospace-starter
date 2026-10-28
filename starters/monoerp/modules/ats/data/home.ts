// Reads for the dashboard, the open roles board, the email templates settings page, and the
// command palette. Monospace has no aggregates in the client, so the dashboard reads the open
// jobs' rows and counts them here; a few hundred active applications is well within one page.
import { queryOptions } from '@tanstack/react-query'

import type { candidatesReadManyArgs, requisitionsReadManyArgs, Uuid } from '@/generated/monospace'
import { keyed, monospace } from '@/lib/monospace'
import { usersById } from '@/lib/monospace-system'

const DAY_MS = 86_400_000

export const UPCOMING_DAYS = 7

export function jobSearchFilter(q: string): NonNullable<requisitionsReadManyArgs['filter']> {
  const number = Number(q.replace(/^req-?/i, ''))

  return {
    _or: [
      { title: { _icontains: q } },
      { departments: { name: { _icontains: q } } },
      ...(Number.isInteger(number) && number > 0 ? [{ reqNumber: number }] : []),
    ],
  }
}

export function candidateSearchFilter(q: string): NonNullable<candidatesReadManyArgs['filter']> {
  const [first, ...rest] = q.trim().split(/\s+/)
  const last = rest.join(' ')

  return {
    _or: [
      { firstName: { _icontains: q } },
      { lastName: { _icontains: q } },
      { email: { _icontains: q } },
      ...(last
        ? [{ _and: [{ firstName: { _icontains: first } }, { lastName: { _icontains: last } }] }]
        : []),
    ],
  }
}

async function fetchOpenJobs() {
  const rows = await monospace.requisitions.readMany({
    fields: [
      'id',
      'reqNumber',
      'title',
      'hiringManagerUserId',
      'recruiterUserId',
      'isConfidential',
      'locations',
      'employmentType',
      'numberOfHires',
      'urgency',
      'openedAt',
    ],
    include: {
      departments: { fields: ['id', 'name'] },
      interview_stages: { fields: ['id', 'name', 'kind', 'position', 'slaDays'] },
    },
    filter: { status: 'open' },
    sort: [{ openedAt: { direction: 'desc' } }],
    limit: 200,
  })

  const jobs = keyed(rows).map((row) => ({
    ...row,
    stages: keyed(row.interview_stages?.data ?? []).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    ),
  }))

  const users = await usersById(
    jobs.flatMap((job) => [job.hiringManagerUserId, job.recruiterUserId]),
  )

  return jobs.map((job) => ({
    ...job,
    hiringManager: (job.hiringManagerUserId && users.get(job.hiringManagerUserId)) || null,
    recruiter: (job.recruiterUserId && users.get(job.recruiterUserId)) || null,
  }))
}

export type OpenJob = Awaited<ReturnType<typeof fetchOpenJobs>>[number]

async function fetchActiveApplications() {
  const rows = await monospace.applications.readMany({
    fields: ['id', 'requisitionId', 'interviewStageId', 'stageEnteredAt', 'appliedAt'],
    include: { candidates: { fields: ['id', 'firstName', 'lastName', 'source'] } },
    filter: { status: 'active', requisitions: { status: 'open' } },
    sort: [{ stageEnteredAt: { direction: 'asc' } }],
    limit: 2000,
  })

  return keyed(rows)
}

export type ActiveApplication = Awaited<ReturnType<typeof fetchActiveApplications>>[number]

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return today
}

async function fetchUpcomingInterviews() {
  const start = startOfToday()

  const rows = await monospace.interviews.readMany({
    fields: ['id', 'title', 'startsAt', 'endsAt', 'meetingUrl'],
    include: {
      applications: {
        fields: ['id'],
        include: {
          candidates: { fields: ['id', 'firstName', 'lastName'] },
          requisitions: { fields: ['id', 'title'] },
        },
      },
      interview_stages: { fields: ['name'] },
      interview_participants: { fields: ['userId'] },
    },
    filter: {
      status: 'scheduled',
      startsAt: {
        _gte: start.toISOString(),
        _lt: new Date(start.getTime() + UPCOMING_DAYS * DAY_MS).toISOString(),
      },
    },
    sort: [{ startsAt: { direction: 'asc' } }],
    limit: 300,
  })

  const interviews = keyed(rows).map((row) => ({
    ...row,
    participantIds: (row.interview_participants?.data ?? []).flatMap((participant) =>
      participant.userId ? [participant.userId] : [],
    ),
  }))

  const users = await usersById(interviews.flatMap((row) => row.participantIds))

  return interviews.map((row) => ({
    ...row,
    participants: row.participantIds.flatMap((id) => {
      const user = users.get(id)

      return user ? [user] : []
    }),
  }))
}

export type UpcomingInterview = Awaited<ReturnType<typeof fetchUpcomingInterviews>>[number]

async function fetchOfferCounts() {
  const rows = await monospace.offers.readMany({
    fields: ['id', 'status'],
    filter: { status: { _in: ['pending_approval', 'approved', 'sent'] } },
    limit: 1000,
  })

  return {
    out: rows.filter((row) => row.status === 'sent').length,
    pending: rows.filter((row) => row.status !== 'sent').length,
  }
}

async function fetchPendingApprovals() {
  const rows = await monospace.approvals.readMany({
    fields: ['id'],
    filter: { decision: 'pending' },
    limit: 1000,
  })

  return rows.length
}

async function fetchDashboard() {
  const [jobs, applications, interviews, offers, approvals] = await Promise.all([
    fetchOpenJobs(),
    fetchActiveApplications(),
    fetchUpcomingInterviews(),
    fetchOfferCounts(),
    fetchPendingApprovals(),
  ])

  return { jobs, applications, interviews, offers, approvals }
}

export type Dashboard = Awaited<ReturnType<typeof fetchDashboard>>

// Keyed under every collection it reads, so a write anywhere in the ATS refreshes it.
export function dashboardQuery() {
  return queryOptions({
    queryKey: ['requisitions', 'applications', 'interviews', 'offers', 'approvals', 'dashboard'],
    queryFn: fetchDashboard,
  })
}

// Days past the stage's SLA, or null when the stage has none or the card is within it.
export function daysOverdue(enteredAt: string | null, slaDays: number | null, now: number) {
  if (!enteredAt || slaDays == null) return null
  const days = Math.floor((now - new Date(enteredAt).getTime()) / DAY_MS) - slaDays

  return days > 0 ? days : null
}

// Open, non-confidential jobs any employee can refer to, with the first stage a referral lands in.
async function fetchOpenRoles() {
  const rows = await monospace.requisitions.readMany({
    fields: [
      'id',
      'reqNumber',
      'title',
      'locations',
      'employmentType',
      'description',
      'mustHaveSkills',
      'hiringManagerUserId',
      'openedAt',
    ],
    include: {
      departments: { fields: ['id', 'name'] },
      job_levels: { fields: ['name'] },
      interview_stages: { fields: ['id', 'position'] },
    },
    filter: { status: 'open', isConfidential: false },
    sort: [{ openedAt: { direction: 'desc' } }],
    limit: 200,
  })

  const roles = keyed(rows).map((row) => ({
    ...row,
    firstStageId:
      [...(row.interview_stages?.data ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      )[0]?.id ?? null,
  }))

  const users = await usersById(roles.map((role) => role.hiringManagerUserId))

  return roles.map((role) => ({
    ...role,
    hiringManager: (role.hiringManagerUserId && users.get(role.hiringManagerUserId)) || null,
  }))
}

export type OpenRole = Awaited<ReturnType<typeof fetchOpenRoles>>[number]

export function openRolesQuery() {
  return queryOptions({ queryKey: ['requisitions', 'open-roles'], queryFn: fetchOpenRoles })
}

// What the signed-in user has referred, newest first.
async function fetchMyReferrals(userId: Uuid) {
  const rows = await monospace.candidates.readMany({
    fields: ['id', 'firstName', 'lastName', 'createdAt'],
    include: {
      applications: {
        fields: ['id', 'status'],
        include: {
          requisitions: { fields: ['id', 'title'] },
          interview_stages: { fields: ['name'] },
        },
      },
    },
    filter: { referrerUserId: userId },
    sort: [{ createdAt: { direction: 'desc' } }],
    limit: 20,
  })

  return keyed(rows)
}

export type MyReferral = Awaited<ReturnType<typeof fetchMyReferrals>>[number]

export function myReferralsQuery(userId: Uuid | undefined) {
  return queryOptions({
    queryKey: ['candidates', 'referrals', userId],
    // SAFETY: `enabled` keeps this from running without a user id.
    queryFn: () => fetchMyReferrals(userId as Uuid),
    enabled: Boolean(userId),
  })
}

async function fetchEmailTemplates() {
  const rows = await monospace.emailTemplates.readMany({
    fields: ['id', 'name', 'subject', 'body', 'updatedAt'],
    sort: [{ name: { direction: 'asc' } }],
    limit: 200,
  })

  return keyed(rows)
}

export type EmailTemplate = Awaited<ReturnType<typeof fetchEmailTemplates>>[number]

export function emailTemplatesQuery() {
  return queryOptions({ queryKey: ['emailTemplates'], queryFn: fetchEmailTemplates })
}
