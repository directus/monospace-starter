// Reads for the candidates area: the list and talent pool, a candidate's profile, and the
// records on its tabs (applications, notes, files, emails, audit history).
import { queryOptions } from '@tanstack/react-query'

import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid, candidatesReadManyArgs } from '@/generated/monospace'
import { PAGE_SIZE, pagesQuery } from '@/lib/list-query'
import { sortSpec } from '@/lib/list-query'
import type { ListParams, Page, Sorts } from '@/lib/list-query'
import { keyed, monospace } from '@/lib/monospace'
import { withUsers } from '@/lib/monospace-system'

export type CandidatesFilter = NonNullable<candidatesReadManyArgs['filter']>

type CandidateSort = NonNullable<candidatesReadManyArgs['sort']>

const RELATED_LIMIT = 100

const LOOKUP_LIMIT = 8

const CANDIDATE_SORTS = {
  name: (direction) => [{ lastName: { direction } }, { firstName: { direction } }],
  source: (direction) => [{ source: { direction } }],
  location: (direction) => [{ country: { direction } }, { city: { direction } }],
  consent: (direction) => [{ consentAt: { direction } }],
  retainUntil: (direction) => [{ retainUntil: { direction } }],
  lastActivity: (direction) => [{ updatedAt: { direction } }],
  createdAt: (direction) => [{ createdAt: { direction } }],
} satisfies Sorts<CandidateSort>

// Tags are one comma-separated text column, so a tag search is a substring match.
export function candidateSearchFilter(q: string): CandidatesFilter {
  const words = q.trim().split(/\s+/).filter(Boolean)
  const [first, ...rest] = words

  // "Ada Lovelace" should find Ada Lovelace: first word on the first name, the rest on the last.
  const fullName =
    first && rest.length
      ? [
          {
            _and: [
              { firstName: { _icontains: first } },
              { lastName: { _icontains: rest.join(' ') } },
            ],
          },
        ]
      : []

  return {
    _or: [
      { firstName: { _icontains: q } },
      { lastName: { _icontains: q } },
      { email: { _icontains: q } },
      { city: { _icontains: q } },
      { country: { _icontains: q } },
      { tags: { _icontains: q } },
      ...fullName,
    ],
  }
}

const APPLICATION_FIELDS = [
  'id',
  'status',
  'requisitionId',
  'interviewStageId',
  'rejectionReason',
  'stageEnteredAt',
  'lastActivityAt',
  'appliedAt',
] as const

async function fetchCandidates({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = PAGE_SIZE,
}: ListParams<CandidatesFilter> & Page) {
  const rows = await monospace.candidates.readMany({
    fields: [
      'id',
      'firstName',
      'lastName',
      'email',
      'city',
      'country',
      'source',
      'sourceDetail',
      'tags',
      'inTalentPool',
      'consentAt',
      'privacyNoticeSentAt',
      'retainUntil',
      'createdAt',
      'updatedAt',
    ],
    include: {
      applications: {
        fields: APPLICATION_FIELDS,
        include: {
          requisitions: { fields: ['id', 'title', 'reqNumber', 'status'] },
          interview_stages: { fields: ['id', 'name', 'kind', 'position'] },
        },
        sort: [{ appliedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
    filter: { _and: [...(q ? [candidateSearchFilter(q)] : []), ...(filter ? [filter] : [])] },
    sort: sortSpec<CandidateSort>(CANDIDATE_SORTS, sort, [{ updatedAt: { direction: 'desc' } }]),
    offset,
    limit,
  })

  return keyed(rows).map((row) => ({
    ...row,
    applications: { data: keyed(row.applications?.data ?? []) },
  }))
}

export type CandidateRow = Awaited<ReturnType<typeof fetchCandidates>>[number]

export function candidatesPagesQuery(filters: ListParams<CandidatesFilter>) {
  return pagesQuery(['candidates', 'pages', filters], (page) =>
    fetchCandidates({ ...filters, ...page }),
  )
}

async function fetchCandidateDetail(candidateId: Uuid) {
  const row = await monospace.candidates.readOne({
    key: candidateId,
    fields: [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'city',
      'country',
      'workAuthorized',
      'needsSponsorship',
      'linkedinUrl',
      'githubUrl',
      'portfolioUrl',
      'source',
      'sourceDetail',
      'referrerUserId',
      'tags',
      'inTalentPool',
      'privacyNoticeSentAt',
      'consentAt',
      'retainUntil',
      'createdAt',
      'createdById',
      'updatedAt',
    ],
  })

  const [filled] = await withUsers([{ ...row, id: candidateId }], {
    referrerUserId: 'referrerUser',
    createdById: 'createdBy',
  })

  return filled ?? { ...row, id: candidateId, referrerUser: null, createdBy: null }
}

export type CandidateDetail = Awaited<ReturnType<typeof fetchCandidateDetail>>

export function candidateDetailQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['candidates', candidateId],
    queryFn: () => fetchCandidateDetail(candidateId),
  })
}

// The candidate's applications with each job's full interview plan, for the stage steppers.
// Keyed under `applications` so a move on the pipeline board refreshes the profile too.
async function fetchCandidateApplications(candidateId: Uuid) {
  const rows = await monospace.applications.readMany({
    fields: APPLICATION_FIELDS,
    include: {
      requisitions: {
        fields: ['id', 'title', 'reqNumber', 'status'],
        include: {
          departments: { fields: ['id', 'name'] },
          interview_stages: {
            fields: ['id', 'name', 'kind', 'position', 'slaDays'],
            sort: [{ position: { direction: 'asc' } }],
            limit: 50,
          },
        },
      },
    },
    filter: { candidateId },
    sort: [{ appliedAt: { direction: 'desc' } }],
    limit: RELATED_LIMIT,
  })

  return keyed(rows).map((row) => ({
    ...row,
    stages: keyed(row.requisitions?.interview_stages?.data ?? []),
  }))
}

export type CandidateApplication = Awaited<ReturnType<typeof fetchCandidateApplications>>[number]

export type InterviewStage = CandidateApplication['stages'][number]

export function candidateApplicationsQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['applications', 'candidate', candidateId],
    queryFn: () => fetchCandidateApplications(candidateId),
  })
}

// Each application's offer, if any, with how far its approval chain has got. Keyed under
// `offers` so the offer drawer's writes refresh it.
async function fetchCandidateOffers(candidateId: Uuid) {
  const rows = await monospace.offers.readMany({
    fields: ['id', 'applicationId', 'status', 'baseSalary', 'currency', 'updatedAt'],
    include: { approvals: { fields: ['id', 'decision'], limit: 20 } },
    filter: { applications: { candidateId } },
    limit: RELATED_LIMIT,
  })

  return keyed(rows).map((row) => {
    const approvals = row.approvals?.data ?? []

    return {
      ...row,
      approved: approvals.filter((approval) => approval.decision === 'approved').length,
      steps: approvals.length,
    }
  })
}

export type CandidateOffer = Awaited<ReturnType<typeof fetchCandidateOffers>>[number]

export function candidateOffersQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['offers', 'candidate', candidateId],
    queryFn: () => fetchCandidateOffers(candidateId),
  })
}

// The active cards in one pipeline column, in the board's order (longest in stage first), for
// stepping to the previous or next candidate from a profile opened off the board.
async function fetchStageNeighbors(requisitionId: Uuid, interviewStageId: Uuid) {
  const rows = await monospace.applications.readMany({
    fields: ['id', 'candidateId'],
    filter: { requisitionId, interviewStageId, status: 'active' },
    sort: [{ stageEnteredAt: { direction: 'asc' } }],
    limit: 500,
  })

  return rows.flatMap((row) => (row.candidateId ? [row.candidateId] : []))
}

export function stageNeighborsQuery(requisitionId: Uuid, interviewStageId: Uuid) {
  return queryOptions({
    queryKey: ['applications', 'stage', requisitionId, interviewStageId],
    queryFn: () => fetchStageNeighbors(requisitionId, interviewStageId),
  })
}

async function fetchCandidateNotes(candidateId: Uuid) {
  const rows = await monospace.candidateNotes.readMany({
    fields: ['id', 'body', 'visibility', 'createdAt', 'createdById'],
    filter: { candidateId },
    sort: [{ createdAt: { direction: 'desc' } }],
    limit: RELATED_LIMIT,
  })

  return withUsers(keyed(rows), { createdById: 'createdBy' })
}

export type CandidateNote = Awaited<ReturnType<typeof fetchCandidateNotes>>[number]

export function candidateNotesQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['candidateNotes', candidateId],
    queryFn: () => fetchCandidateNotes(candidateId),
  })
}

async function fetchCandidateFiles(candidateId: Uuid) {
  const rows = await monospace.candidateFiles.readMany({
    fields: ['id', 'kind', 'assetId', 'url', 'fileName', 'contentType', 'createdAt', 'createdById'],
    filter: { candidateId },
    sort: [{ createdAt: { direction: 'desc' } }],
    limit: RELATED_LIMIT,
  })

  return withUsers(keyed(rows), { createdById: 'createdBy' })
}

export type CandidateFile = Awaited<ReturnType<typeof fetchCandidateFiles>>[number]

export function candidateFilesQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['candidateFiles', candidateId],
    queryFn: () => fetchCandidateFiles(candidateId),
  })
}

async function fetchCandidateMessages(candidateId: Uuid) {
  const rows = await monospace.candidateMessages.readMany({
    fields: ['id', 'direction', 'subject', 'body', 'status', 'sendAt', 'createdAt', 'createdById'],
    filter: { candidateId },
    sort: [{ sendAt: { direction: 'desc' } }],
    limit: RELATED_LIMIT,
  })

  return withUsers(keyed(rows), { createdById: 'createdBy' })
}

export type CandidateMessage = Awaited<ReturnType<typeof fetchCandidateMessages>>[number]

export function candidateMessagesQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['candidateMessages', candidateId],
    queryFn: () => fetchCandidateMessages(candidateId),
  })
}

async function fetchEmailTemplates() {
  const rows = await monospace.emailTemplates.readMany({
    fields: ['id', 'name', 'subject', 'body'],
    sort: [{ name: { direction: 'asc' } }],
    limit: 100,
  })

  return keyed(rows)
}

export type EmailTemplate = Awaited<ReturnType<typeof fetchEmailTemplates>>[number]

export function emailTemplatesQuery() {
  return queryOptions({
    queryKey: ['emailTemplates'],
    queryFn: fetchEmailTemplates,
    staleTime: 5 * 60_000,
  })
}

async function fetchCandidateAudit(candidateId: Uuid) {
  const rows = await monospace.auditEvents.readMany({
    fields: ['id', 'tableName', 'recordId', 'action', 'actorUserId', 'changes', 'occurredAt'],
    filter: { candidateId },
    sort: [{ occurredAt: { direction: 'desc' } }],
    limit: 200,
  })

  return withUsers(keyed(rows), { actorUserId: 'actorUser' })
}

export type AuditEvent = Awaited<ReturnType<typeof fetchCandidateAudit>>[number]

export function candidateAuditQuery(candidateId: Uuid) {
  return queryOptions({
    queryKey: ['auditEvents', 'candidate', candidateId],
    queryFn: () => fetchCandidateAudit(candidateId),
  })
}

// Jobs for the add-to-job pickers and the list's job filter. Closed jobs can't take candidates.
function requisitionOption(row: {
  id: Uuid
  title: string | null
  reqNumber: number | null
}): RelationOption {
  return {
    value: row.id,
    label: row.title ?? '',
    description: row.reqNumber ? `REQ-${row.reqNumber}` : undefined,
  }
}

export async function lookupRequisitions(q: string) {
  const rows = await monospace.requisitions.readMany({
    fields: ['id', 'title', 'reqNumber'],
    filter: {
      _and: [{ status: { _neq: 'closed' } }, ...(q ? [{ title: { _icontains: q } }] : [])],
    },
    sort: [{ title: { direction: 'asc' } }],
    limit: LOOKUP_LIMIT,
  })

  return keyed(rows).map(requisitionOption)
}

export async function resolveRequisitions(ids: Array<Uuid>) {
  if (!ids.length) return []

  const rows = await monospace.requisitions.readMany({
    fields: ['id', 'title', 'reqNumber'],
    filter: { id: { _in: ids } },
    limit: ids.length,
  })

  return keyed(rows).map(requisitionOption)
}

// Every job has its own plan, but most share stage names, so the stage filter offers names.
export async function lookupStageNames(q: string) {
  const rows = await monospace.interviewStages.readMany({
    fields: ['name', 'position'],
    filter: q ? { name: { _icontains: q } } : undefined,
    sort: [{ position: { direction: 'asc' } }],
    limit: 500,
  })

  const names = [...new Set(rows.flatMap((row) => (row.name ? [row.name] : [])))]

  return names.map((name) => ({ value: name, label: name }))
}

// One profile per email. Emails are matched case-insensitively, like the unique index.
export async function findCandidateByEmail(email: string) {
  const needle = email.trim().toLowerCase()

  if (!needle) return null

  const rows = await monospace.candidates.readMany({
    fields: ['id', 'firstName', 'lastName', 'email'],
    filter: { email: { _icontains: needle } },
    limit: 20,
  })

  return keyed(rows).find((row) => row.email?.toLowerCase() === needle) ?? null
}

// The first stage of a job's plan, where a new application starts.
export async function firstStage(requisitionId: Uuid) {
  const [stage] = await monospace.interviewStages.readMany({
    fields: ['id', 'name'],
    filter: { requisitionId },
    sort: [{ position: { direction: 'asc' } }],
    limit: 1,
  })

  return stage?.id ? { ...stage, id: stage.id } : null
}
