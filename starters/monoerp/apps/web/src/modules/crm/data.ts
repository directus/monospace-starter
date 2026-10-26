import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { z } from 'zod'

import type { RelationOption } from '@/components/form/relation-combobox'
import type {
  Uuid,
  attachmentsReadManyArgs,
  contactsReadManyArgs,
  interactionsReadManyArgs,
  opportunitiesReadManyArgs,
  organizationsReadManyArgs,
} from '@/generated/monospace'
import { keyed, monospace } from '@/lib/monospace'
import { usersById } from '@/lib/monospace-system'
import { contactOption, organizationOption } from '@/modules/crm/entity-options'
import { stageColor } from '@/modules/crm/stage-color'

// `filter` is the Monospace clause built from the page's active filters (see lib/filters.tsx).
// `sort` is a table column id, mapped to Monospace fields per collection below.
export type ListSort = { id: string; desc: boolean } | null

type ListFilters<TFilter> = {
  q?: string
  filter?: TFilter
  sort?: ListSort
}

type Page = { offset?: number; limit?: number }

export const PAGE_SIZE = 50

type Direction = 'asc' | 'desc'

type Sorts<T> = Record<string, (direction: Direction) => T>

type ContactSort = NonNullable<contactsReadManyArgs['sort']>

type OrganizationSort = NonNullable<organizationsReadManyArgs['sort']>

type OpportunitySort = NonNullable<opportunitiesReadManyArgs['sort']>

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

const OPPORTUNITY_SORTS = {
  title: (direction) => [{ title: { direction } }],
  status: (direction) => [{ status: { direction } }],
  value: (direction) => [{ valueAmount: { direction } }],
  closeDate: (direction) => [{ expectedCloseDate: { direction } }],
  updatedAt: (direction) => [{ updatedAt: { direction } }],
} satisfies Sorts<OpportunitySort>

function sortSpec<T>(sorts: Sorts<T>, sort: ListSort | undefined, fallback: T) {
  const toSort = sort ? sorts[sort.id] : undefined

  return toSort ? toSort(sort?.desc ? 'desc' : 'asc') : fallback
}

async function withOwners<T extends { ownerUserId?: Uuid | null }>(rows: ReadonlyArray<T>) {
  const users = await usersById(rows.map((row) => row.ownerUserId))

  return rows.map((row) => ({
    ...row,
    owner: row.ownerUserId ? (users.get(row.ownerUserId) ?? null) : null,
  }))
}

async function withOwner<T extends { ownerUserId?: Uuid | null }>(row: T) {
  const users = await usersById([row.ownerUserId])

  return { ...row, owner: row.ownerUserId ? (users.get(row.ownerUserId) ?? null) : null }
}

async function withCreators<T extends { createdById?: Uuid | null }>(rows: ReadonlyArray<T>) {
  const users = await usersById(rows.map((row) => row.createdById))

  return rows.map((row) => ({
    ...row,
    createdBy: row.createdById ? (users.get(row.createdById) ?? null) : null,
  }))
}

// Pages keep loading until one comes back short.
function nextOffset<T>(lastPage: Array<T>, pages: Array<Array<T>>) {
  return lastPage.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE
}

export type OrganizationsFilter = NonNullable<organizationsReadManyArgs['filter']>

export type ContactsFilter = NonNullable<contactsReadManyArgs['filter']>

export type OpportunitiesFilter = NonNullable<opportunitiesReadManyArgs['filter']>

const LIST_LIMIT = 250

const RELATED_LIMIT = 100

export type InteractionsFilter = NonNullable<interactionsReadManyArgs['filter']>

const INTERACTION_FIELDS = [
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
  'opportunityId',
] as const

const INTERACTION_INCLUDE = {
  organizations: { fields: ['id', 'name', 'domain'] },
  contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
  opportunities: {
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
  'opportunityId',
  'interactionId',
] as const

const ATTACHMENT_INCLUDE = {
  organizations: { fields: ['id', 'name', 'domain'] },
  contacts: { fields: ['id', 'firstName', 'lastName', 'email'] },
  opportunities: { fields: ['id', 'title'] },
  interactions: { fields: ['id', 'subject', 'type'] },
} as const

// Where a file lives. Every attachment has an organization; the rest narrow it further.
export type AttachmentTarget = {
  organizationId: Uuid
  contactId?: Uuid | null
  opportunityId?: Uuid | null
  interactionId?: Uuid | null
}

export type AttachmentScope =
  | { organizationId: Uuid }
  | { contactId: Uuid }
  | { opportunityId: Uuid }
  | { interactionId: Uuid }

type AttachmentsFilter = NonNullable<attachmentsReadManyArgs['filter']>

// Files attached to an activity stay on that activity; record pages only list what was put on
// the record itself.
function scopeFilter(scope: AttachmentScope): AttachmentsFilter {
  if ('interactionId' in scope) return { interactionId: scope.interactionId }
  const own = { interactionId: { _null: true } }

  if ('organizationId' in scope) return { ...own, organizationId: scope.organizationId }

  if ('contactId' in scope) return { ...own, contactId: scope.contactId }

  return { ...own, opportunityId: scope.opportunityId }
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

export function opportunitySearchFilter(q: string) {
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
}: ListFilters<OrganizationsFilter> & Page) {
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
      opportunities: {
        fields: ['id'],
        filter: { status: 'open' },
        limit: RELATED_LIMIT,
      },
    },
    filter: { _and: [...(q ? [organizationSearchFilter(q)] : []), ...(filter ? [filter] : [])] },
    sort: sortSpec<OrganizationSort>(ORGANIZATION_SORTS, sort, [{ name: { direction: 'asc' } }]),
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type OrganizationRow = Awaited<ReturnType<typeof fetchOrganizations>>[number]

export function organizationsPagesQuery(filters: ListFilters<OrganizationsFilter>) {
  return infiniteQueryOptions({
    queryKey: ['organizations', 'pages', filters],
    queryFn: ({ pageParam }) =>
      fetchOrganizations({ ...filters, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

async function fetchContacts({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = LIST_LIMIT,
}: ListFilters<ContactsFilter> & Page) {
  const rows = await monospace.contacts.readMany({
    fields: ['id', 'firstName', 'lastName', 'email', 'status', 'updatedAt'],
    include: {
      contact_organizations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: { organizations: { fields: ['id', 'name', 'domain'] } },
        sort: [{ isPrimary: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
    filter: { _and: [...(q ? [contactSearchFilter(q)] : []), ...(filter ? [filter] : [])] },
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

export function contactsPagesQuery(filters: ListFilters<ContactsFilter>) {
  return infiniteQueryOptions({
    queryKey: ['contacts', 'pages', filters],
    queryFn: ({ pageParam }) => fetchContacts({ ...filters, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

async function fetchOpportunities({
  q = '',
  filter,
  sort,
  offset = 0,
  limit = LIST_LIMIT,
}: ListFilters<OpportunitiesFilter> & Page) {
  const rows = await monospace.opportunities.readMany({
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
    filter: { _and: [...(q ? [opportunitySearchFilter(q)] : []), ...(filter ? [filter] : [])] },
    sort: sortSpec<OpportunitySort>(OPPORTUNITY_SORTS, sort, [
      { updatedAt: { direction: 'desc' } },
    ]),
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type OpportunityRow = Awaited<ReturnType<typeof fetchOpportunities>>[number]

// Every matching deal at once, for the board and the dashboard.
export function opportunitiesQuery(filters: ListFilters<OpportunitiesFilter>) {
  return queryOptions({
    queryKey: ['opportunities', filters],
    queryFn: () => fetchOpportunities(filters),
  })
}

export function opportunitiesPagesQuery(filters: ListFilters<OpportunitiesFilter>) {
  return infiniteQueryOptions({
    queryKey: ['opportunities', 'pages', filters],
    queryFn: ({ pageParam }) =>
      fetchOpportunities({ ...filters, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
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
      contact_organizations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: {
          contacts: {
            fields: ['id', 'firstName', 'lastName', 'email', 'status'],
          },
        },
        sort: [{ isPrimary: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      opportunities: {
        fields: ['id', 'title', 'status', 'valueAmount', 'currency', 'expectedCloseDate'],
        include: {
          pipeline_stages: { fields: ['id', 'name', 'position', 'color', 'isClosed', 'isWon'] },
        },
        sort: [{ updatedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      interactions: {
        fields: INTERACTION_FIELDS,
        include: INTERACTION_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    contact_organizations: { data: keyed(detail.contact_organizations?.data ?? []) },
    opportunities: { data: keyed(detail.opportunities?.data ?? []) },
    interactions: { data: await withOwners(keyed(detail.interactions?.data ?? [])) },
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
      contact_organizations: {
        fields: ['id', 'title', 'startedAt', 'endedAt', 'isPrimary'],
        include: { organizations: { fields: ['id', 'name', 'domain', 'status'] } },
        sort: [{ startedAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
      interactions: {
        fields: INTERACTION_FIELDS,
        include: INTERACTION_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    contact_organizations: { data: keyed(detail.contact_organizations?.data ?? []) },
    interactions: { data: await withOwners(keyed(detail.interactions?.data ?? [])) },
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

export async function resolveOpportunities(ids: Array<Uuid>): Promise<Array<RelationOption>> {
  if (!ids.length) return []

  const rows = await monospace.opportunities.readMany({
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
    filter: {
      _and: [
        ...(q ? [contactSearchFilter(q)] : []),
        ...(organizationId ? [{ contact_organizations: { organizationId } }] : []),
      ],
    },
    sort: [{ lastName: { direction: 'asc' } }, { firstName: { direction: 'asc' } }],
    limit: LOOKUP_LIMIT,
  })

  return rows.flatMap((row) => {
    const option = contactOption(row)

    return option ? [option] : []
  })
}

export async function lookupOpportunities(
  q: string,
  organizationId?: Uuid,
): Promise<Array<RelationOption>> {
  const rows = await monospace.opportunities.readMany({
    fields: ['id', 'title'],
    include: { organizations: { fields: ['name'] } },
    filter: {
      _and: [
        ...(q ? [opportunitySearchFilter(q)] : []),
        ...(organizationId ? [{ organizationId }] : []),
      ],
    },
    sort: [{ updatedAt: { direction: 'desc' } }],
    limit: LOOKUP_LIMIT,
  })

  return rows.flatMap((row) =>
    row.id && row.title
      ? [{ value: row.id, label: row.title, description: row.organizations?.name ?? undefined }]
      : [],
  )
}

async function fetchOpportunityDetail(opportunityId: Uuid) {
  const detail = await monospace.opportunities.readOne({
    key: opportunityId,
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
      interactions: {
        fields: INTERACTION_FIELDS,
        include: INTERACTION_INCLUDE,
        sort: [{ occurredAt: { direction: 'desc' } }],
        limit: RELATED_LIMIT,
      },
    },
  })

  return {
    ...(await withOwner(detail)),
    interactions: { data: await withOwners(keyed(detail.interactions?.data ?? [])) },
  }
}

export type OpportunityDetail = Awaited<ReturnType<typeof fetchOpportunityDetail>>

export function opportunityDetailQuery(opportunityId: Uuid) {
  return queryOptions({
    queryKey: ['opportunities', opportunityId],
    queryFn: () => fetchOpportunityDetail(opportunityId),
  })
}

function interactionSearchFilter(q: string): InteractionsFilter {
  return { _or: [{ subject: { _icontains: q } }, { body: { _icontains: q } }] }
}

// `view` picks the status slice and its natural order: open work soonest-due first, history
// most recent first.
export const interactionsView = z.enum(['todo', 'history'])

export type InteractionsView = z.infer<typeof interactionsView>

async function fetchInteractions({
  view,
  q = '',
  filter,
  offset = 0,
  limit = LIST_LIMIT,
}: ListFilters<InteractionsFilter> & Page & { view: InteractionsView }) {
  const rows = await monospace.interactions.readMany({
    fields: INTERACTION_FIELDS,
    include: INTERACTION_INCLUDE,
    filter: {
      _and: [
        view === 'todo' ? { status: 'open' } : { status: { _neq: 'open' } },
        ...(q ? [interactionSearchFilter(q)] : []),
        ...(filter ? [filter] : []),
      ],
    },
    sort:
      view === 'todo'
        ? [{ dueAt: { direction: 'asc' } }, { occurredAt: { direction: 'asc' } }]
        : [{ occurredAt: { direction: 'desc' } }],
    offset,
    limit,
  })

  return withOwners(keyed(rows))
}

export type InteractionRow = Awaited<ReturnType<typeof fetchInteractions>>[number]

export function interactionsPagesQuery(
  filters: ListFilters<InteractionsFilter> & { view: InteractionsView },
) {
  return infiniteQueryOptions({
    queryKey: ['interactions', 'pages', filters],
    queryFn: ({ pageParam }) =>
      fetchInteractions({ ...filters, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  })
}

// Every open item's due date, for the triage counts. Cheap enough to take in one page.
export function openDueDatesQuery(filters: ListFilters<InteractionsFilter>) {
  return queryOptions({
    queryKey: ['interactions', 'open-due', filters],
    queryFn: () =>
      monospace.interactions.readMany({
        fields: ['id', 'dueAt', 'occurredAt'],
        filter: {
          _and: [
            { status: 'open' },
            ...(filters.q ? [interactionSearchFilter(filters.q)] : []),
            ...(filters.filter ? [filters.filter] : []),
          ],
        },
        limit: 1000,
      }),
  })
}

// What happened most recently on the same organization, for context in the detail sheet.
export function recentInteractionsQuery(organizationId: Uuid, excludeId: Uuid) {
  return queryOptions({
    queryKey: ['interactions', 'recent', organizationId, excludeId],
    queryFn: async () =>
      withOwners(
        keyed(
          await monospace.interactions.readMany({
            fields: INTERACTION_FIELDS,
            include: INTERACTION_INCLUDE,
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
