import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'

import type { RelationOption } from '@/components/form/relation-combobox'
import type {
  Uuid,
  attachmentsReadManyArgs,
  contactsReadManyArgs,
  activitiesReadManyArgs,
  dealsReadManyArgs,
  organizationsReadManyArgs,
} from '@/generated/monospace'
import { pagesQuery, readAllPages, sortSpec } from '@/lib/list-query'
import type { ListParams, Page, Sorts } from '@/lib/list-query'
import { keyed, monospace } from '@/lib/monospace'
import { withUsers } from '@/lib/monospace-system'
import { contactOption, organizationOption } from '@/modules/crm/entities'
import { stageColor } from '@/modules/crm/stage-color'

type ContactSort = NonNullable<contactsReadManyArgs['sort']>

type OrganizationSort = NonNullable<organizationsReadManyArgs['sort']>

type DealSort = NonNullable<dealsReadManyArgs['sort']>

// Column id -> Monospace sort for that column. Columns missing here aren't sortable.
const CONTACT_SORTS = {
  name: (direction) => [{ lastName: { direction } }, { firstName: { direction } }],
  email: (direction) => [{ email: { direction } }],
  status: (direction) => [{ status: { direction } }],
  updatedAt: (direction) => [{ updatedAt: { direction } }],
} satisfies Sorts<ContactSort>

const ORGANIZATION_SORTS = {
  name: (direction) => [{ name: { direction } }],
  industry: (direction) => [{ industry: { direction } }],
  status: (direction) => [{ status: { direction } }],
  domain: (direction) => [{ domain: { direction } }],
  updatedAt: (direction) => [{ updatedAt: { direction } }],
} satisfies Sorts<OrganizationSort>

const DEAL_SORTS = {
  title: (direction) => [{ title: { direction } }],
  status: (direction) => [{ status: { direction } }],
  value: (direction) => [{ valueAmount: { direction } }],
  closeDate: (direction) => [{ expectedCloseDate: { direction } }],
  updatedAt: (direction) => [{ updatedAt: { direction } }],
} satisfies Sorts<DealSort>

async function withOwners<T extends { ownerUserId?: Uuid | null }>(rows: ReadonlyArray<T>) {
  return withUsers(rows, { ownerUserId: 'owner' })
}

async function withOwner<T extends { ownerUserId?: Uuid | null }>(row: T) {
  const [filled] = await withOwners([row])

  if (!filled) throw new Error('Owner lookup did not return the record')

  return filled
}

async function withCreators<T extends { createdById?: Uuid | null }>(rows: ReadonlyArray<T>) {
  return withUsers(rows, { createdById: 'createdBy' })
}

export type OrganizationsFilter = NonNullable<organizationsReadManyArgs['filter']>

export type ContactsFilter = NonNullable<contactsReadManyArgs['filter']>

export type DealsFilter = NonNullable<dealsReadManyArgs['filter']>

function whereAll<T>(...clauses: (T | undefined)[]) {
  return { _and: clauses.filter((clause): clause is T => clause !== undefined) }
}

const LIST_LIMIT = 250

const RELATED_LIMIT = 100

export type ActivityFilter = NonNullable<activitiesReadManyArgs['filter']>

const ACTIVITY_FIELDS = [
  'id',
  'type',
  'status',
  'direction',
  'subject',
  'body',
  'occurredAt',
  'dueAt',
  'completedAt',
  'ownerUserId',
  'organizationId',
  'contactId',
  'dealId',
] as const

const ACTIVITY_INCLUDE = {
  organizations: { fields: ['id', 'name', 'domain'] },
  contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
  deals: {
    fields: ['id', 'title', 'valueAmount', 'currency'],
    include: { pipeline_stages: { fields: ['name'] } },
  },
  attachments: { fields: ['id'], limit: RELATED_LIMIT },
} as const

const ATTACHMENT_FIELDS = [
  'id',
  'assetId',
  'url',
  'fileName',
  'contentType',
  'sizeBytes',
  'createdAt',
  'createdById',
  'organizationId',
  'contactId',
  'dealId',
  'activityId',
] as const

const ATTACHMENT_INCLUDE = {
  organizations: { fields: ['id', 'name', 'domain'] },
  contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
  deals: { fields: ['id', 'title'] },
  activities: { fields: ['id', 'subject', 'type'] },
} as const

// Where a file lives. Every attachment has an organization; the rest narrow it further.
export type AttachmentTarget = {
  organizationId: Uuid
  contactId?: Uuid | null
  dealId?: Uuid | null
  activityId?: Uuid | null
}

export type AttachmentScope =
  | { organizationId: Uuid }
  | { contactId: Uuid }
  | { dealId: Uuid }
  | { activityId: Uuid }

type AttachmentsFilter = NonNullable<attachmentsReadManyArgs['filter']>

// Files attached to an activity stay on that activity; record pages only list what was put on
// the record itself.
function scopeFilter(scope: AttachmentScope): AttachmentsFilter {
  if ('activityId' in scope) return { activityId: scope.activityId }
  const own = { activityId: { _null: true } }

  if ('organizationId' in scope) return { ...own, organizationId: scope.organizationId }

  if ('contactId' in scope) return { ...own, contactId: scope.contactId }

  return { ...own, dealId: scope.dealId }
}

async function fetchAttachments(scope: AttachmentScope) {
  const rows = await monospace.attachments.readMany({
    fields: ATTACHMENT_FIELDS,
    include: ATTACHMENT_INCLUDE,
    filter: scopeFilter(scope),
    sort: [{ createdAt: { direction: 'desc' } }],
    limit: RELATED_LIMIT,
  })

  return withCreators(keyed(rows))
}

export type AttachmentRow = Awaited<ReturnType<typeof fetchAttachments>>[number]

export function attachmentsQuery(scope: AttachmentScope) {
  return queryOptions({
    queryKey: ['attachments', scope],
    queryFn: () => fetchAttachments(scope),
  })
}

export function organizationSearchFilter(q: string) {
  return {
    _or: [
      { name: { _icontains: q } },
      { industry: { _icontains: q } },
      { domain: { _icontains: q } },
    ],
  }
}

export function contactSearchFilter(q: string) {
  return {
    _or: [
      { firstName: { _icontains: q } },
      { lastName: { _icontains: q } },
      { email: { _icontains: q } },
    ],
  }
}

export function dealSearchFilter(q: string) {
  return {
    _or: [{ title: { _icontains: q } }, { organizations: { name: { _icontains: q } } }],
  }
}

async function fetchOrganizations({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = LIST_LIMIT,
}: ListParams<OrganizationsFilter> & Page) {
  const rows = await monospace.organizations.readMany({
    fields: [
      'id',
      'name',
      'domain',
      'industry',
      'status',
      'ownerUserId',
      'portalAccountId',
      'updatedAt',
    ],
    include: {
      deals: {
        fields: ['id'],
        filter: { status: 'open' },
        limit: RELATED_LIMIT,
      },
    },
    filter: whereAll<OrganizationsFilter>(q ? organizationSearchFilter(q) : undefined, filter),
    sort: sortSpec<OrganizationSort>(ORGANIZATION_SORTS, sort, [{ name: { direction: 'asc' } }]),
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type OrganizationRow = Awaited<ReturnType<typeof fetchOrganizations>>[number]

export function organizationsPagesQuery(filters: ListParams<OrganizationsFilter>) {
  return pagesQuery(['organizations', 'pages', filters], (page) =>
    fetchOrganizations({ ...filters, ...page }),
  )
}

async function fetchContacts({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = LIST_LIMIT,
}: ListParams<ContactsFilter> & Page) {
  const rows = await monospace.contacts.readMany({
    fields: ['id', 'firstName', 'lastName', 'email', 'status', 'updatedAt'],
    include: {
      affiliations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: { organizations: { fields: ['id', 'name', 'domain'] } },
        sort: [{ isPrimary: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
    filter: whereAll<ContactsFilter>(q ? contactSearchFilter(q) : undefined, filter),
    sort: sortSpec<ContactSort>(CONTACT_SORTS, sort, [
      { lastName: { direction: 'asc' } },
      { firstName: { direction: 'asc' } },
    ]),
    offset,
    limit,
  })

  return keyed(rows)
}

export type ContactRow = Awaited<ReturnType<typeof fetchContacts>>[number]

export function contactsPagesQuery(filters: ListParams<ContactsFilter>) {
  return pagesQuery(['contacts', 'pages', filters], (page) =>
    fetchContacts({ ...filters, ...page }),
  )
}

async function fetchDeals({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = LIST_LIMIT,
}: ListParams<DealsFilter> & Page) {
  const rows = await monospace.deals.readMany({
    fields: [
      'id',
      'title',
      'status',
      'valueAmount',
      'currency',
      'expectedCloseDate',
      'contactId',
      'ownerUserId',
      'updatedAt',
    ],
    include: {
      contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
      organizations: { fields: ['id', 'name', 'domain'] },
      pipeline_stages: { fields: ['id', 'name', 'position', 'color'] },
    },
    filter: whereAll<DealsFilter>(q ? dealSearchFilter(q) : undefined, filter),
    sort: sortSpec<DealSort>(DEAL_SORTS, sort, [{ updatedAt: { direction: 'desc' } }]),
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type DealRow = Awaited<ReturnType<typeof fetchDeals>>[number]

// Every matching deal at once, for the board and the dashboard.
export function dealsQuery(filters: ListParams<DealsFilter>) {
  return queryOptions({
    queryKey: ['deals', filters],
    queryFn: async () => readAllPages((page) => fetchDeals({ ...filters, ...page })),
  })
}

export function dealsPagesQuery(filters: ListParams<DealsFilter>) {
  return pagesQuery(['deals', 'pages', filters], (page) => fetchDeals({ ...filters, ...page }))
}

async function fetchOrganizationDetail(organizationId: Uuid) {
  const detail = await monospace.organizations.readOne({
    key: organizationId,
    fields: [
      'id',
      'name',
      'domain',
      'industry',
      'status',
      'notes',
      'ownerUserId',
      'portalAccountId',
      'createdAt',
      'updatedAt',
    ],
    include: {
      affiliations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: {
          contacts: {
            fields: ['id', 'firstName', 'lastName', 'email', 'status'],
          },
        },
        sort: [{ isPrimary: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      deals: {
        fields: ['id', 'title', 'status', 'valueAmount', 'currency', 'expectedCloseDate'],
        include: {
          pipeline_stages: { fields: ['id', 'name', 'position', 'color', 'isClosed', 'isWon'] },
        },
        sort: [{ updatedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      activities: {
        fields: ACTIVITY_FIELDS,
        include: ACTIVITY_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    id: organizationId,
    affiliations: { data: keyed(detail.affiliations?.data ?? []) },
    deals: { data: keyed(detail.deals?.data ?? []) },
    activities: { data: await withOwners(keyed(detail.activities?.data ?? [])) },
  }
}

export type OrganizationDetail = Awaited<ReturnType<typeof fetchOrganizationDetail>>

export function organizationDetailQuery(organizationId: Uuid) {
  return queryOptions({
    queryKey: ['organizations', organizationId],
    queryFn: () => fetchOrganizationDetail(organizationId),
  })
}

async function fetchContactDetail(contactId: Uuid) {
  const detail = await monospace.contacts.readOne({
    key: contactId,
    fields: [
      'id',
      'firstName',
      'lastName',
      'email',
      'phone',
      'status',
      'notes',
      'ownerUserId',
      'createdAt',
      'updatedAt',
    ],
    include: {
      affiliations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: { organizations: { fields: ['id', 'name', 'domain', 'status'] } },
        sort: [{ startedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      activities: {
        fields: ACTIVITY_FIELDS,
        include: ACTIVITY_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    id: contactId,
    affiliations: { data: keyed(detail.affiliations?.data ?? []) },
    activities: { data: await withOwners(keyed(detail.activities?.data ?? [])) },
  }
}

export type ContactDetail = Awaited<ReturnType<typeof fetchContactDetail>>

export function contactDetailQuery(contactId: Uuid) {
  return queryOptions({
    queryKey: ['contacts', contactId],
    queryFn: () => fetchContactDetail(contactId),
  })
}

const LOOKUP_LIMIT = 8

async function fetchPipelineStages() {
  const rows = await monospace.pipelineStages.readMany({
    fields: ['id', 'name', 'position', 'color', 'isClosed', 'isWon'],
    sort: [{ position: { direction: 'asc' } }],
    limit: 50,
  })

  return keyed(rows)
}

export type PipelineStage = Awaited<ReturnType<typeof fetchPipelineStages>>[number]

function stageOption(stage: PipelineStage): RelationOption {
  return {
    value: stage.id,
    label: stage.name ?? '',
    color: stageColor(stage, (stage.position ?? 1) - 1),
  }
}

export async function resolveStages(ids: Array<Uuid>): Promise<Array<RelationOption>> {
  const stages = await fetchPipelineStages()
  const wanted = new Set(ids)

  return stages.filter((stage) => wanted.has(stage.id)).map(stageOption)
}

export async function resolveOrganizations(ids: Array<Uuid>): Promise<Array<RelationOption>> {
  if (!ids.length) return []

  const rows = await monospace.organizations.readMany({
    fields: ['id', 'name', 'domain'],
    filter: { id: { _in: ids } },
    limit: ids.length,
  })

  return rows.flatMap((row) => {
    const option = organizationOption(row)

    return option ? [option] : []
  })
}

export async function resolveDeals(ids: Array<Uuid>): Promise<Array<RelationOption>> {
  if (!ids.length) return []

  const rows = await monospace.deals.readMany({
    fields: ['id', 'title'],
    filter: { id: { _in: ids } },
    limit: ids.length,
  })

  return rows.flatMap((row) => (row.id && row.title ? [{ value: row.id, label: row.title }] : []))
}

export async function lookupStages(q: string): Promise<Array<RelationOption>> {
  const stages = await fetchPipelineStages()
  const needle = q.trim().toLowerCase()

  return stages
    .filter((stage) => !needle || stage.name?.toLowerCase().includes(needle))
    .map(stageOption)
}

export function pipelineStagesQuery() {
  return queryOptions({
    queryKey: ['pipelineStages'],
    queryFn: fetchPipelineStages,
    staleTime: 5 * 60_000,
  })
}

// Lookups feed the relation comboboxes in forms. They return {value,label} shapes directly.

export async function lookupOrganizations(q: string): Promise<Array<RelationOption>> {
  const rows = await monospace.organizations.readMany({
    fields: ['id', 'name', 'domain'],
    filter: q ? organizationSearchFilter(q) : {},
    sort: [{ name: { direction: 'asc' } }],
    limit: LOOKUP_LIMIT,
  })

  return rows.flatMap((row) => {
    const option = organizationOption(row)

    return option ? [option] : []
  })
}

export async function lookupContacts(
  q: string,
  organizationId?: Uuid,
): Promise<Array<RelationOption>> {
  const rows = await monospace.contacts.readMany({
    fields: ['id', 'firstName', 'lastName', 'email'],
    filter: whereAll<ContactsFilter>(
      q ? contactSearchFilter(q) : undefined,
      organizationId ? { affiliations: { organizationId } } : undefined,
    ),
    sort: [{ lastName: { direction: 'asc' } }, { firstName: { direction: 'asc' } }],
    limit: LOOKUP_LIMIT,
  })

  return rows.flatMap((row) => {
    const option = contactOption(row)

    return option ? [option] : []
  })
}

export async function lookupDeals(
  q: string,
  organizationId?: Uuid,
): Promise<Array<RelationOption>> {
  const rows = await monospace.deals.readMany({
    fields: ['id', 'title'],
    include: { organizations: { fields: ['name'] } },
    filter: whereAll<DealsFilter>(
      q ? dealSearchFilter(q) : undefined,
      organizationId ? { organizationId } : undefined,
    ),
    sort: [{ updatedAt: { direction: 'desc' } }],
    limit: LOOKUP_LIMIT,
  })

  return rows.flatMap((row) =>
    row.id && row.title
      ? [{ value: row.id, label: row.title, description: row.organizations?.name ?? undefined }]
      : [],
  )
}

async function fetchDealDetail(dealId: Uuid) {
  const detail = await monospace.deals.readOne({
    key: dealId,
    fields: [
      'id',
      'title',
      'status',
      'notes',
      'valueAmount',
      'currency',
      'expectedCloseDate',
      'contactId',
      'ownerUserId',
      'organizationId',
      'stageId',
      'createdAt',
      'updatedAt',
    ],
    include: {
      contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
      organizations: { fields: ['id', 'name', 'domain', 'industry', 'status', 'portalAccountId'] },
      pipeline_stages: { fields: ['id', 'name', 'position', 'color'] },
      activities: {
        fields: ACTIVITY_FIELDS,
        include: ACTIVITY_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    id: dealId,
    activities: { data: await withOwners(keyed(detail.activities?.data ?? [])) },
  }
}

export type DealDetail = Awaited<ReturnType<typeof fetchDealDetail>>

export function dealDetailQuery(dealId: Uuid) {
  return queryOptions({
    queryKey: ['deals', dealId],
    queryFn: () => fetchDealDetail(dealId),
  })
}

function activitySearchFilter(q: string): ActivityFilter {
  return { _or: [{ subject: { _icontains: q } }, { body: { _icontains: q } }] }
}

// `view` picks the status slice and its natural order: open work soonest-due first, history
// most recent first.
export const activityView = z.enum(['todo', 'history'])

export type ActivityView = z.infer<typeof activityView>

async function fetchActivities({
  view,
  q = '',
  filter,
  offset = 0,
  limit = LIST_LIMIT,
}: ListParams<ActivityFilter> & Page & { view: ActivityView }) {
  const rows = await monospace.activities.readMany({
    fields: ACTIVITY_FIELDS,
    include: ACTIVITY_INCLUDE,
    filter: whereAll<ActivityFilter>(
      view === 'todo' ? { status: 'open' } : { status: { _neq: 'open' } },
      q ? activitySearchFilter(q) : undefined,
      filter,
    ),
    sort:
      view === 'todo'
        ? [{ dueAt: { direction: 'asc' } }, { occurredAt: { direction: 'asc' } }]
        : [{ occurredAt: { direction: 'desc' } }],
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type ActivityRecord = Awaited<ReturnType<typeof fetchActivities>>[number]

export function activityPagesQuery(filters: ListParams<ActivityFilter> & { view: ActivityView }) {
  return pagesQuery(['activities', 'pages', filters], (page) =>
    fetchActivities({ ...filters, ...page }),
  )
}

// Every open item's due date, for the triage counts. Cheap enough to take in one page.
export function openDueDatesQuery(filters: ListParams<ActivityFilter>) {
  return queryOptions({
    queryKey: ['activities', 'open-due', filters],
    queryFn: () =>
      monospace.activities.readMany({
        fields: ['id', 'dueAt', 'occurredAt'],
        filter: whereAll<ActivityFilter>(
          { status: 'open' },
          filters.q ? activitySearchFilter(filters.q) : undefined,
          filters.filter,
        ),
        limit: 1000,
      }),
  })
}

// What happened most recently on the same organization, for context in the detail sheet.
export function recentActivitiesQuery(organizationId: Uuid, excludeId: Uuid) {
  return queryOptions({
    queryKey: ['activities', 'recent', organizationId, excludeId],
    queryFn: async () =>
      withOwners(
        keyed(
          await monospace.activities.readMany({
            fields: ACTIVITY_FIELDS,
            include: ACTIVITY_INCLUDE,
            filter: {
              _and: [{ organizationId }, { id: { _neq: excludeId } }, { status: { _neq: 'open' } }],
            },
            sort: [{ occurredAt: { direction: 'desc' } }],
            limit: 3,
          }),
        ),
      ),
  })
}
