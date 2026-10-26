import type {
  FilterSerialized,
  KeyedOperation,
  KeyedQueryResultSerialized,
  MonospaceObject,
  OperationName,
  OperationSerialized,
  QueryRequest,
  QueryResultFor,
  QueryResultSerialized,
  SortItemSerialized,
} from '@monospace/extension-kit/data-connector'
import type { StripeClient, StripeObject } from './client'
import type { StripeConfig } from './config'
import type { FieldSpec, ResourceSpec } from './resources'
import {
  QueryRejected,
  CollectionNotFound,
  ForeignKeyConstraintViolation,
} from '@monospace/extension-kit/data-connector'
import { StripeResourceMissing } from './client'
import { matches } from './filter'
import { planSources } from './plan'
import { comparable, encodeFormValue, project, toRecord } from './records'
import { findResource } from './resources'

/** Stripe's test-mode limit is 25 requests per second; stay well below it. */
const CONCURRENCY = 4

export interface QueryContext {
  readonly client: StripeClient
  readonly config: StripeConfig
}

type Operation<Name extends OperationSerialized['op']> = Extract<OperationSerialized, { op: Name }>

export async function executeQuery(
  context: QueryContext,
  request: QueryRequest<OperationName>,
): Promise<QueryResultFor<OperationName>> {
  const query = request.query
  const resource = findResource(query.collection)

  if (resource === undefined)
    throw new CollectionNotFound(`Stripe connector has no collection \`${query.collection}\`.`)

  switch (query.op) {
    case 'readMany':
      return await readMany(context, resource, query)
    case 'readOne':
      return await keyed(context, resource, query, (records) => records)
    case 'create':
      return await create(context, resource, query)
    case 'updateMany':
      return await updateMany(context, resource, query)
    case 'updateOne':
      return await keyed(context, resource, query, (records) =>
        updateRecords(context, resource, records, query.data),
      )
    case 'deleteMany':
      return await deleteMany(context, resource, query)
    case 'deleteOne':
      return await keyed(context, resource, query, (records) =>
        deleteRecords(context, resource, records),
      )
    default:
      throw new QueryRejected('The Stripe connector received an unknown operation.')
  }
}

async function readMany(
  context: QueryContext,
  resource: ResourceSpec,
  query: Operation<'readMany'>,
): Promise<QueryResultSerialized> {
  if (query.count === true) throw new QueryRejected('Stripe cannot count records.')

  const records = await findRecords(context, resource, {
    filter: query.filter,
    sort: query.sort ?? [],
    offset: query.offset ?? 0,
    limit: query.limit,
  })

  return { records: records.map((record) => project(record, query.select ?? [])) }
}

/** The key and the operation's own condition, as one filter. */
function keyFilter(query: KeyedOperation): FilterSerialized {
  const keys: FilterSerialized[] = Object.entries(query.key).map(([field, value]) => ({
    cmp: 'equals',
    left: { field },
    right: { value },
  }))

  return { and: query.filter === undefined ? keys : [...keys, query.filter] }
}

/**
 * Runs a keyed operation: finds the one record its key and filter address, then applies `act`
 * to it. A miss answers `{ record: null }` and changes nothing.
 */
async function keyed(
  context: QueryContext,
  resource: ResourceSpec,
  query: KeyedOperation,
  act: (records: MonospaceObject[]) => MonospaceObject[] | Promise<MonospaceObject[]>,
): Promise<KeyedQueryResultSerialized> {
  const found = await findRecords(context, resource, {
    filter: keyFilter(query),
    sort: [],
    offset: 0,
    limit: 1,
  })

  if (found.length === 0) return { record: null }

  const [record] = await act(found)

  return { record: record === undefined ? null : project(record, query.select) }
}

async function create(
  context: QueryContext,
  resource: ResourceSpec,
  query: Operation<'create'>,
): Promise<QueryResultSerialized> {
  requireWrite(context, resource, resource.canCreate, 'create')
  const records: MonospaceObject[] = []

  // Sequential, so a failure leaves a prefix of the input created and the order is preserved.
  for (const data of query.data) {
    const form = encodeForm(resource, data, 'isCreatable', false)
    const created = await context.client.post(resource.path, form)
    records.push(project(toRecord(resource, created), query.select))
  }

  return { records }
}

async function updateMany(
  context: QueryContext,
  resource: ResourceSpec,
  query: Operation<'updateMany'>,
): Promise<QueryResultSerialized> {
  const targets = await findRecords(context, resource, {
    filter: query.filter,
    sort: [],
    offset: 0,
    limit: undefined,
  })

  const updated = await updateRecords(context, resource, targets, query.data)

  return { records: updated.map((record) => project(record, query.select)) }
}

async function updateRecords(
  context: QueryContext,
  resource: ResourceSpec,
  targets: readonly MonospaceObject[],
  data: MonospaceObject,
): Promise<MonospaceObject[]> {
  requireWrite(context, resource, resource.canUpdate, 'update')
  const form = encodeForm(resource, data, 'isUpdatable', true)

  const updated = await mapConcurrently(
    targets,
    async (record) =>
      await context.client.post(`${resource.path}/${encodeURIComponent(String(record.id))}`, form),
  )

  return updated.map((object) => toRecord(resource, object))
}

async function deleteMany(
  context: QueryContext,
  resource: ResourceSpec,
  query: Operation<'deleteMany'>,
): Promise<QueryResultSerialized> {
  // Stripe deletes one id at a time and answers with a tombstone, so the selected output is read
  // first. Concurrent writers can change a record between that read and its deletion.
  const targets = await findRecords(context, resource, {
    filter: query.filter,
    sort: [],
    offset: 0,
    limit: undefined,
  })

  const deleted = await deleteRecords(context, resource, targets)

  return { records: deleted.map((record) => project(record, query.select)) }
}

/** Answers with the records as they were before deletion. */
async function deleteRecords(
  context: QueryContext,
  resource: ResourceSpec,
  targets: MonospaceObject[],
): Promise<MonospaceObject[]> {
  requireWrite(context, resource, resource.canDelete, 'delete')

  await mapConcurrently(targets, async (record) => {
    try {
      await context.client.delete(resource.path, String(record.id))
    } catch (error) {
      throw toDeleteError(resource, error)
    }
  })

  return targets
}

interface FindOptions {
  readonly filter: FilterSerialized | undefined
  readonly sort: readonly SortItemSerialized[]
  readonly offset: number
  /** `undefined` reads every match. */
  readonly limit: number | undefined
}

/**
 * Reads the matching records in Stripe's newest-first order. A single list skips `offset` records
 * as it pages; several requests (from `in` or `or`) each fetch at most `offset + limit` records
 * and are merged by creation time.
 */
async function findRecords(
  context: QueryContext,
  resource: ResourceSpec,
  options: FindOptions,
): Promise<MonospaceObject[]> {
  if (!isNewestFirst(options.sort)) {
    // Stripe only lists newest first, so any other order reads every match (within the
    // query's budget) and sorts it here. Studio asks for this: it sorts by the primary key.
    const all = await findRecords(context, resource, {
      ...options,
      sort: [],
      offset: 0,
      limit: undefined,
    })
    const end = options.limit === undefined ? undefined : options.offset + options.limit

    return all
      .toSorted((left, right) => compareRecords(resource, options.sort, left, right))
      .slice(options.offset, end)
  }

  const sources = planSources(resource, options.filter)
  const budget = { remaining: context.config.maxItemsPerQuery }
  const [only] = sources

  if (sources.length === 1 && only!.kind === 'list') {
    const objects = await readList(
      context,
      resource,
      only!.parameters,
      options.offset,
      options.limit,
      budget,
    )

    return objects.map((object) => toRecord(resource, object))
  }

  const wanted = options.limit === undefined ? undefined : options.offset + options.limit

  const fetched = await mapConcurrently(sources, async (source) =>
    source.kind === 'list'
      ? await readList(context, resource, source.parameters, 0, wanted, budget)
      : await retrieve(context, resource, source.ids, budget),
  )

  const unique = new Map(fetched.flat().map((object) => [object.id, object]))

  const records = [...unique.values()]
    .toSorted((left, right) => createdOf(right) - createdOf(left) || (left.id < right.id ? 1 : -1))
    .map((object) => toRecord(resource, object))
    // Retrieved objects still have to satisfy the rest of the filter.
    .filter((record) => matches(resource, options.filter, record))

  return records.slice(options.offset, wanted)
}

async function readList(
  context: QueryContext,
  resource: ResourceSpec,
  parameters: Readonly<Record<string, string>>,
  offset: number,
  limit: number | undefined,
  budget: { remaining: number },
): Promise<StripeObject[]> {
  const objects: StripeObject[] = []

  if (limit === 0) return objects

  try {
    for await (const object of context.client.list(resource.path, parameters, offset)) {
      spend(resource, budget, context)
      objects.push(object)

      if (objects.length === limit) break
    }
  } catch (error) {
    // A reference filter naming an object that does not exist matches nothing.
    if (!(error instanceof StripeResourceMissing)) throw error
  }

  return objects
}

async function retrieve(
  context: QueryContext,
  resource: ResourceSpec,
  ids: readonly string[],
  budget: { remaining: number },
): Promise<StripeObject[]> {
  const objects = await mapConcurrently(ids, async (id) => {
    spend(resource, budget, context)

    return await context.client.retrieve(resource.path, id)
  })

  return objects.filter((object) => object !== undefined)
}

/** Guards reads Engine leaves unbounded, such as a relation batch or an explicit `limit=-1`. */
function spend(resource: ResourceSpec, budget: { remaining: number }, context: QueryContext): void {
  budget.remaining -= 1

  if (budget.remaining < 0) {
    throw new QueryRejected(
      `Reading \`${resource.name}\` would fetch more than ${context.config.maxItemsPerQuery} Stripe items. ` +
        "Narrow the filter, request a smaller page, or raise the connector's `maxItemsPerQuery`.",
    )
  }
}

/** Stripe lists newest first and cannot sort otherwise; only `created` is declared sortable. */
/** Stripe's own order: newest first, which is also what an unsorted read gets. */
function isNewestFirst(sort: readonly SortItemSerialized[]): boolean {
  return (
    sort.length === 0 ||
    (sort.length === 1 &&
      sort[0]!.field === 'created' &&
      sort[0]!.direction === 'descending' &&
      sort[0]!.nulls === undefined)
  )
}

/** SQL's defaults when `nulls` is unset: NULLs sort last ascending and first descending. */
function compareRecords(
  resource: ResourceSpec,
  sort: readonly SortItemSerialized[],
  left: MonospaceObject,
  right: MonospaceObject,
): number {
  for (const item of sort) {
    const field = requireField(resource, item.field)
    const a = comparable(field.kind, left[item.field] ?? null)
    const b = comparable(field.kind, right[item.field] ?? null)
    const descending = item.direction === 'descending'

    if (a === b) continue
    if (a === null || b === null) {
      const nullsFirst = item.nulls === undefined ? descending : item.nulls === 'first'
      return (a === null) === nullsFirst ? -1 : 1
    }

    const order = a < b ? -1 : 1
    return descending ? -order : order
  }

  return 0
}

function createdOf(object: StripeObject): number {
  return typeof object.created === 'number' ? object.created : 0
}

function encodeForm(
  resource: ResourceSpec,
  data: MonospaceObject,
  capability: 'isCreatable' | 'isUpdatable',
  isUpdate: boolean,
): URLSearchParams {
  const form = new URLSearchParams()

  for (const [name, value] of Object.entries(data)) {
    const field = requireField(resource, name)

    if (field[capability] !== true) {
      throw new QueryRejected(`\`${resource.name}.${name}\` cannot be written by this operation.`)
    }

    encodeFormValue(field, value, form, isUpdate)
  }

  return form
}

function requireField(resource: ResourceSpec, name: string): FieldSpec {
  const field = resource.fields.find((candidate) => candidate.name === name)

  if (field === undefined) throw new QueryRejected(`\`${resource.name}\` has no field \`${name}\`.`)

  return field
}

function requireWrite(
  context: QueryContext,
  resource: ResourceSpec,
  isSupported: boolean,
  action: string,
): void {
  if (!context.config.enableWrites) {
    throw new QueryRejected('Writes are disabled for this Stripe connection (`enableWrites`).')
  }

  if (!isSupported) throw new QueryRejected(`Stripe \`${resource.name}\` cannot ${action} records.`)
}

function toDeleteError(resource: ResourceSpec, error: unknown): unknown {
  // Stripe refuses to delete a product that still has prices, which can never be deleted themselves.
  if (
    resource.name === 'products' &&
    error instanceof QueryRejected &&
    /price/iu.test(error.message)
  ) {
    return new ForeignKeyConstraintViolation(error.message, { cause: error })
  }

  return error
}

async function mapConcurrently<T, R>(
  items: readonly T[],
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let next = 0

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await map(items[index]!)
    }
  })

  await Promise.all(workers)

  return results
}
