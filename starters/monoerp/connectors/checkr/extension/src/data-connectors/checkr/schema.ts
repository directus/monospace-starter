import {
  defineCollection,
  defineRelation,
  defineSchema,
  field,
  fields,
  filter,
  index,
  paging,
} from '@monospace/extension-kit/data-connector/experimental'

// Checkr filters lists on a few parameters only, so query() sends what it can and filters the rest
// in memory. Results keep Checkr's order: no sort is declared.
const text = filter.field('equals', 'in', 'contains', 'icontains', 'startsWith', 'endsWith')

const id = filter.field('equals', 'in')

const flag = filter.field('equals')

const instant = filter.field(
  'equals',
  'greaterThan',
  'greaterThanOrEquals',
  'lessThan',
  'lessThanOrEquals',
)

const logical = filter.logical('and', 'or', 'not')

// SSNs, driver license numbers and maiden names are left out on purpose: they would be copied into
// whatever reads this data source.
export const candidates = defineCollection({
  name: 'candidates',
  fields: {
    id: field.string({ length: 64 }),
    first_name: field.string({ nullable: true }),
    middle_name: field.string({ nullable: true }),
    last_name: field.string({ nullable: true }),
    email: field.string({ length: 255, nullable: true }),
    phone: field.string({ length: 64, nullable: true }),
    zipcode: field.string({ length: 16, nullable: true }),
    dob: field.date({ nullable: true }),
    custom_id: field.string({ length: 255, nullable: true }),
    adjudication: field.string({ length: 32, nullable: true }),
    report_ids: field.string({ list: true }),
    geo_ids: field.string({ list: true }),
    metadata: field.json({ nullable: true }),
    created_at: field.dateTimeWithTimezone({ nullable: true }),
  },
  indexes: { candidates_pkey: index.primary(['id']) },
  operations: {
    readMany: {
      filter: {
        fields: {
          id,
          first_name: text,
          last_name: text,
          email: text,
          custom_id: text,
          adjudication: id,
          zipcode: text,
          dob: instant,
          created_at: instant,
        },
        logicalOperators: logical,
      },
      limit: paging.limit(),
      offset: paging.offset(),
      output: fields.all(),
      meta: { totalCount: true },
    },
    readOne: { output: fields.all() },
  },
})

// Checkr has no endpoint listing reports: every read must filter `id` or `candidate_id` with
// `equals` or `in`.
export const reports = defineCollection({
  name: 'reports',
  fields: {
    id: field.string({ length: 64 }),
    candidate_id: field.string({ length: 64 }),
    status: field.string({ length: 32 }),
    result: field.string({ length: 32, nullable: true }),
    adjudication: field.string({ length: 32, nullable: true }),
    assessment: field.string({ length: 32, nullable: true }),
    package: field.string({ length: 255, nullable: true }),
    source: field.string({ length: 32, nullable: true }),
    includes_canceled: field.boolean(),
    archived: field.boolean(),
    turnaround_time: field.int32({ nullable: true }),
    created_at: field.dateTimeWithTimezone({ nullable: true }),
    completed_at: field.dateTimeWithTimezone({ nullable: true }),
    revised_at: field.dateTimeWithTimezone({ nullable: true }),
    upgraded_at: field.dateTimeWithTimezone({ nullable: true }),
    estimated_completion_time: field.dateTimeWithTimezone({ nullable: true }),
  },
  indexes: { reports_pkey: index.primary(['id']) },
  operations: {
    readMany: {
      filter: {
        fields: {
          id,
          candidate_id: id,
          status: id,
          result: id,
          adjudication: id,
          assessment: id,
          package: text,
          archived: flag,
          created_at: instant,
          completed_at: instant,
        },
        logicalOperators: logical,
      },
      limit: paging.limit(),
      offset: paging.offset(),
      output: fields.all(),
    },
    readOne: { output: fields.all() },
  },
})

export const invitations = defineCollection({
  name: 'invitations',
  fields: {
    id: field.string({ length: 64 }),
    candidate_id: field.string({ length: 64 }),
    report_id: field.string({ length: 64, nullable: true }),
    status: field.string({ length: 32 }),
    package: field.string({ length: 255, nullable: true }),
    invitation_url: field.string({ nullable: true }),
    archived: field.boolean(),
    created_at: field.dateTimeWithTimezone({ nullable: true }),
    expires_at: field.dateTimeWithTimezone({ nullable: true }),
    completed_at: field.dateTimeWithTimezone({ nullable: true }),
    deleted_at: field.dateTimeWithTimezone({ nullable: true }),
  },
  indexes: { invitations_pkey: index.primary(['id']) },
  operations: {
    readMany: {
      filter: {
        fields: {
          id,
          candidate_id: id,
          report_id: id,
          status: id,
          package: text,
          archived: flag,
          created_at: instant,
          expires_at: instant,
          completed_at: instant,
        },
        logicalOperators: logical,
      },
      limit: paging.limit(),
      offset: paging.offset(),
      output: fields.all(),
      meta: { totalCount: true },
    },
    readOne: { output: fields.all() },
  },
})

export const packages = defineCollection({
  name: 'packages',
  fields: {
    id: field.string({ length: 64 }),
    name: field.string(),
    slug: field.string({ length: 255 }),
    // In cents.
    price: field.int32({ nullable: true }),
    apply_url: field.string({ nullable: true }),
    screenings: field.json({ nullable: true }),
    created_at: field.dateTimeWithTimezone({ nullable: true }),
    deleted_at: field.dateTimeWithTimezone({ nullable: true }),
  },
  indexes: { packages_pkey: index.primary(['id']) },
  operations: {
    readMany: {
      filter: {
        fields: { id, name: text, slug: text, created_at: instant, deleted_at: instant },
        logicalOperators: logical,
      },
      limit: paging.limit(),
      offset: paging.offset(),
      output: fields.all(),
      meta: { totalCount: true },
    },
    readOne: { output: fields.all() },
  },
})

const reportCandidate = defineRelation({
  name: 'report_candidate',
  from: reports,
  to: candidates,
  on: [['candidate_id', 'id']],
  names: { forward: 'candidate', reverse: 'reports' },
})

const invitationCandidate = defineRelation({
  name: 'invitation_candidate',
  from: invitations,
  to: candidates,
  on: [['candidate_id', 'id']],
  names: { forward: 'candidate', reverse: 'invitations' },
})

const invitationReport = defineRelation({
  name: 'invitation_report',
  from: invitations,
  to: reports,
  on: [['report_id', 'id']],
  names: { forward: 'report', reverse: 'invitations' },
})

export const schema = defineSchema({
  collections: [candidates, reports, invitations, packages],
  relations: [reportCandidate, invitationCandidate, invitationReport],
})
