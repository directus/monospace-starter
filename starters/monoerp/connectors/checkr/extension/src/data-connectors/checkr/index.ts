import type {
  FilterSerialized,
  MonospaceObject,
  ReadManyOperationSerialized,
  ReadOneOperationSerialized,
  Value,
} from '@monospace/extension-kit/data-connector'
import {
  CollectionNotFound,
  defineDataConnector,
  InvalidConfiguration,
  QueryRejected,
} from '@monospace/extension-kit/data-connector'

import type { Environment, Params } from './checkr-api'
import { CheckrClient, HOSTS } from './checkr-api'
import { matches, valuesOf } from './filter'
import { schema } from './schema'

interface CheckrConfig {
  /** A secret API key from the Checkr dashboard. */
  apiKey?: unknown
  /** `production` (the default) or `staging`. */
  environment?: unknown
  /** Overrides the environment's host, e.g. `http://checkr:4020` for a local emulator. */
  apiBase?: unknown
}

// Reads that ask for records by id, as relation reads do, fetch up to this many one by one instead
// of listing every record.
const MAX_LOOKUPS = 25

const LOOKUP_CONCURRENCY = 10

function settings(config: CheckrConfig): {
  apiKey: string
  environment: Environment
  apiBase?: URL
} {
  const { apiKey, environment = 'production', apiBase } = config

  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new InvalidConfiguration('apiKey must be a Checkr secret API key.')
  }

  if (environment !== 'production' && environment !== 'staging') {
    throw new InvalidConfiguration('environment must be production or staging.')
  }

  if (apiBase === undefined) return { apiKey: apiKey.trim(), environment }

  const url = typeof apiBase === 'string' && URL.canParse(apiBase) ? new URL(apiBase) : undefined

  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/') {
    throw new InvalidConfiguration('apiBase must be an http(s) origin, such as http://checkr:4020.')
  }

  return { apiKey: apiKey.trim(), environment, apiBase: url }
}

/** Checkr's timestamps as RFC 3339 in UTC, or null when absent or unreadable. */
function timestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)

  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

function date(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

type Raw = Record<string, unknown>

function toCandidate(raw: Raw): MonospaceObject {
  return {
    id: String(raw.id),
    first_name: string(raw.first_name),
    middle_name: string(raw.middle_name),
    last_name: string(raw.last_name),
    email: string(raw.email),
    phone: string(raw.phone),
    zipcode: string(raw.zipcode),
    dob: date(raw.dob),
    custom_id: string(raw.custom_id),
    adjudication: string(raw.adjudication),
    report_ids: strings(raw.report_ids),
    geo_ids: strings(raw.geo_ids),
    metadata:
      raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as MonospaceObject) : null,
    created_at: timestamp(raw.created_at),
  }
}

function toReport(raw: Raw): MonospaceObject {
  return {
    id: String(raw.id),
    candidate_id: String(raw.candidate_id),
    status: String(raw.status),
    result: string(raw.result),
    adjudication: string(raw.adjudication),
    assessment: string(raw.assessment),
    package: string(raw.package),
    source: string(raw.source),
    includes_canceled: raw.includes_canceled === true,
    archived: raw.archived === true,
    turnaround_time: integer(raw.turnaround_time),
    created_at: timestamp(raw.created_at),
    completed_at: timestamp(raw.completed_at),
    revised_at: timestamp(raw.revised_at),
    upgraded_at: timestamp(raw.upgraded_at),
    estimated_completion_time: timestamp(raw.estimated_completion_time),
  }
}

function toInvitation(raw: Raw): MonospaceObject {
  return {
    id: String(raw.id),
    candidate_id: String(raw.candidate_id),
    report_id: string(raw.report_id),
    status: String(raw.status),
    package: string(raw.package),
    invitation_url: string(raw.invitation_url),
    archived: raw.archived === true,
    created_at: timestamp(raw.created_at),
    expires_at: timestamp(raw.expires_at),
    completed_at: timestamp(raw.completed_at),
    deleted_at: timestamp(raw.deleted_at),
  }
}

function toPackage(raw: Raw): MonospaceObject {
  return {
    id: String(raw.id),
    name: String(raw.name ?? raw.slug ?? raw.id),
    slug: string(raw.slug) ?? '',
    price: integer(raw.price),
    apply_url: string(raw.apply_url),
    screenings: Array.isArray(raw.screenings) ? (raw.screenings as Value[]) : null,
    created_at: timestamp(raw.created_at),
    deleted_at: timestamp(raw.deleted_at),
  }
}

interface Resource {
  path: string
  map: (raw: Raw) => MonospaceObject
}

const RESOURCES: Record<string, Resource> = {
  candidates: { path: 'candidates', map: toCandidate },
  reports: { path: 'reports', map: toReport },
  invitations: { path: 'invitations', map: toInvitation },
  packages: { path: 'packages', map: toPackage },
}

function resource(collection: string): Resource {
  const found = RESOURCES[collection]

  if (!found) throw new CollectionNotFound(`Checkr has no ${collection} collection.`)

  return found
}

function uniqueStrings(values: Value[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))]
}

/** The one string `field` must equal, to send as a Checkr list parameter. */
function single(filter: FilterSerialized | undefined, field: string): string | undefined {
  const values = valuesOf(filter, field)

  return values?.length === 1 && typeof values[0] === 'string' ? values[0] : undefined
}

/**
 * A lower and upper bound on `field` that `filter` requires through `and`, widened by a second so
 * Checkr's exclusive or inclusive comparison cannot drop a matching record. The filter still runs
 * in memory afterwards.
 */
function bounds(
  filter: FilterSerialized | undefined,
  field: string,
): { after?: string; before?: string } {
  if (filter === undefined) return {}

  if (filter.and !== undefined)
    return Object.assign({}, ...filter.and.map((child) => bounds(child, field)))

  if (filter.cmp === undefined) return {}

  const fieldLeft = filter.left.field === field && filter.right.field === undefined
  const fieldRight = filter.right.field === field && filter.left.field === undefined

  if (!fieldLeft && !fieldRight) return {}

  const value = fieldLeft ? filter.right.value : filter.left.value
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN

  if (Number.isNaN(time)) return {}
  const after = new Date(time - 1000).toISOString()
  const before = new Date(time + 1000).toISOString()

  const lower = fieldLeft
    ? ['greaterThan', 'greaterThanOrEquals']
    : ['lessThan', 'lessThanOrEquals']

  const upper = fieldLeft
    ? ['lessThan', 'lessThanOrEquals']
    : ['greaterThan', 'greaterThanOrEquals']

  if (filter.cmp === 'equals') return { after, before }

  if (lower.includes(filter.cmp)) return { after }

  if (upper.includes(filter.cmp)) return { before }

  return {}
}

function project(record: MonospaceObject, select: string[] | undefined): MonospaceObject {
  if (select === undefined) return record

  return Object.fromEntries(select.map((field) => [field, record[field] ?? null]))
}

export default defineDataConnector<CheckrConfig>({
  preflight({ config }) {
    const { environment, apiBase } = settings(config)
    const port = apiBase && (apiBase.port || (apiBase.protocol === 'https:' ? '443' : '80'))

    return {
      permissions: [
        {
          permission: apiBase ? `net:${apiBase.hostname}:${port}` : `net:${HOSTS[environment]}`,
          reason: 'Reads background check data from the Checkr API',
        },
      ],
    }
  },

  setup({ config }) {
    const { apiKey, environment, apiBase } = settings(config)
    const checkr = new CheckrClient(apiKey, environment, apiBase)

    async function lookup(collection: string, ids: string[]): Promise<MonospaceObject[]> {
      const { path, map } = resource(collection)
      const found: Raw[] = []

      for (let start = 0; start < ids.length; start += LOOKUP_CONCURRENCY) {
        const batch = ids.slice(start, start + LOOKUP_CONCURRENCY)

        const raws = await Promise.all(
          batch.map((id) => checkr.get<Raw>(`${path}/${encodeURIComponent(id)}`)),
        )

        found.push(...raws.filter((raw): raw is Raw => raw !== null))
      }

      return found.map(map)
    }

    async function* listed(
      collection: string,
      params: Params,
      from: number,
    ): AsyncGenerator<MonospaceObject> {
      const { path, map } = resource(collection)

      for await (const raw of checkr.paginate<Raw>(path, params, from)) yield map(raw)
    }

    /** The Checkr list parameters a filter on `collection` can be narrowed with. */
    function params(collection: string, filter: FilterSerialized | undefined): Params {
      switch (collection) {
        case 'candidates': {
          const created = bounds(filter, 'created_at')

          return {
            email: single(filter, 'email'),
            custom_id: single(filter, 'custom_id'),
            adjudication: single(filter, 'adjudication'),
            created_after: created.after,
            created_before: created.before,
          }
        }

        case 'invitations':
          return { candidate_id: single(filter, 'candidate_id'), status: single(filter, 'status') }
        default:
          return {}
      }
    }

    async function* reportsOf(candidateIds: string[]): AsyncGenerator<MonospaceObject> {
      for (const candidate of await lookup('candidates', candidateIds)) {
        yield* await lookup('reports', candidate.report_ids as string[])
      }
    }

    /** The records `query` reads, before filtering, starting at the zero-based `from`. */
    async function* source(
      query: ReadManyOperationSerialized,
      from: number,
    ): AsyncGenerator<MonospaceObject> {
      const ids = valuesOf(query.filter, 'id')

      if (query.collection === 'reports') {
        const candidateIds = valuesOf(query.filter, 'candidate_id')

        if (ids !== undefined) return yield* await lookup('reports', uniqueStrings(ids))

        if (candidateIds !== undefined) return yield* reportsOf(uniqueStrings(candidateIds))
        throw new QueryRejected(
          'Checkr has no list of reports. Filter reports by id or candidate_id with equals or in.',
        )
      }

      if (ids !== undefined && ids.length <= MAX_LOOKUPS)
        return yield* await lookup(query.collection, uniqueStrings(ids))

      yield* listed(query.collection, params(query.collection, query.filter), from)
    }

    async function readMany(query: ReadManyOperationSerialized) {
      if (query.count) {
        if (query.filter === undefined && query.collection !== 'reports') {
          const { count } = await checkr.list(resource(query.collection).path, {}, 1, 1)

          if (typeof count === 'number') return { totalCount: count }
        }

        let totalCount = 0

        for await (const record of source(query, 0)) if (matches(record, query.filter)) totalCount++

        return { totalCount }
      }

      const page: MonospaceObject[] = []
      const limit = query.limit ?? Number.POSITIVE_INFINITY

      if (limit <= 0) return { records: page }

      // Without a filter, Checkr's pages line up with the offset, so whole pages are skipped.
      const offset = query.offset ?? 0
      const from = query.filter === undefined ? offset : 0
      let toSkip = offset - from

      // Stops paging Checkr as soon as the page is full.
      for await (const record of source(query, from)) {
        if (!matches(record, query.filter)) continue

        if (toSkip > 0) {
          toSkip--
          continue
        }

        page.push(project(record, query.select))

        if (page.length >= limit) break
      }

      return { records: page }
    }

    async function readOne(query: ReadOneOperationSerialized) {
      const id = query.key.id

      if (typeof id !== 'string') return { record: null }

      const [record] = await lookup(query.collection, [id])

      return {
        record: record && matches(record, query.filter) ? project(record, query.select) : null,
      }
    }

    return {
      introspect() {
        return schema.toSchemaDocument()
      },

      query({ query }) {
        switch (query.op) {
          case 'readMany':
            return readMany(query)
          case 'readOne':
            return readOne(query)
          default:
            throw new QueryRejected(
              `The Checkr connector is read-only; ${query.op} is not supported.`,
            )
        }
      },

      async testConnection() {
        if ((await checkr.get('account')) === null)
          throw new InvalidConfiguration('Checkr found no account for the API key.')

        return { ok: true }
      },
    }
  },
})
