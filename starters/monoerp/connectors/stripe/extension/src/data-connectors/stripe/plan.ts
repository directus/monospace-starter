import type { FilterSerialized, Value } from '@monospace/extension-kit/data-connector'
import type { FieldSpec, ResourceSpec } from './resources'
import { QueryRejected } from '@monospace/extension-kit/data-connector'

/**
 * One Stripe request. A `list` source returns exactly the records of one filter branch, in
 * Stripe's newest-first order. A `retrieve` source returns objects by id; the caller evaluates the
 * rest of the filter on them in memory, which stays cheap because the ids bound the work.
 */
export type Source =
  | { readonly kind: 'list'; readonly parameters: Readonly<Record<string, string>> }
  | { readonly kind: 'retrieve'; readonly ids: readonly string[] }

/** Fan-out bound: `in`, `or`, and their combinations become one Stripe request each. */
const MAX_SOURCES = 250

/** One conjunction of constraints Stripe can apply itself. */
interface Branch {
  /** Allowed values per field; several constraints on one field intersect. */
  readonly values: ReadonlyMap<string, ReadonlySet<string>>
  /** Inclusive `created` bounds in Unix seconds. */
  readonly lower?: number
  readonly upper?: number
}

const EVERYTHING: Branch = { values: new Map() }

class NotExpressible extends Error {}

/** A field Stripe can filter by exact value: the id (by retrieving it) or a list parameter. */
export function isPushable(field: FieldSpec): boolean {
  return field.kind === 'id' || field.listParameter !== undefined
}

/**
 * Turns a filter into Stripe requests whose union is exactly the matching records. A filter Stripe
 * cannot express is refused rather than answered by reading every record, unless top-level id
 * constraints bound the candidates.
 */
export function planSources(
  resource: ResourceSpec,
  filter: FilterSerialized | undefined,
): Source[] {
  const ids = topLevelIds(filter)

  if (ids !== undefined) return ids.length === 0 ? [] : [{ kind: 'retrieve', ids }]

  let branches: Branch[]

  try {
    branches = filter === undefined ? [EVERYTHING] : toBranches(resource, filter)
  } catch (error) {
    if (!(error instanceof NotExpressible)) throw error
    throw new QueryRejected(
      `Stripe cannot filter \`${resource.name}\` by ${error.message} without reading every record.`,
    )
  }

  const sources = new Map<string, Source>()

  for (const source of branches.flatMap((branch) => toSources(resource, branch))) {
    sources.set(JSON.stringify(source), source)
  }

  if (sources.size > MAX_SOURCES) throw tooManyRequests(resource)

  return [...sources.values()]
}

function toBranches(resource: ResourceSpec, filter: FilterSerialized): Branch[] {
  if (filter.and !== undefined) {
    return filter.and.reduce<Branch[]>(
      (combined, child) => {
        const next = combined.flatMap((left) =>
          toBranches(resource, child).map((right) => intersect(left, right)),
        )

        if (next.length > MAX_SOURCES) throw tooManyRequests(resource)

        return next
      },
      [EVERYTHING],
    )
  }

  if (filter.or !== undefined) return filter.or.flatMap((child) => toBranches(resource, child))

  if (filter.not !== undefined) throw new NotExpressible('a negation')

  if (filter.in !== undefined) {
    const field = pushableField(resource, filter.in.field)

    if (!Array.isArray(filter.values))
      throw new NotExpressible(`\`${field.name}\` against another field`)

    // NULL is never IN a set, so null members cannot match.
    const values = filter.values
      .filter((value) => value !== null)
      .map((value) => literal(field, value))

    return [{ values: new Map([[field.name, new Set(values)]]) }]
  }

  const isReversed = filter.left.field === undefined
  const fieldName = isReversed ? filter.right.field : filter.left.field
  const value = isReversed ? filter.left.value : filter.right.value

  if (fieldName === undefined || value === undefined)
    throw new NotExpressible('comparing two fields')

  if (value === null) throw new NotExpressible(`\`${fieldName}\` being null`)

  if (fieldName === 'created' && resource.filtersCreated)
    return [createdBranch(filter.cmp, isReversed, value)]

  const field = pushableField(resource, fieldName)

  if (filter.cmp !== 'equals') throw new NotExpressible(`\`${field.name}\` ${filter.cmp}`)

  return [{ values: new Map([[field.name, new Set([literal(field, value)])]]) }]
}

function intersect(left: Branch, right: Branch): Branch {
  const values = new Map(left.values)

  for (const [field, allowed] of right.values) {
    const existing = values.get(field)
    values.set(
      field,
      existing === undefined
        ? allowed
        : new Set([...existing].filter((value) => allowed.has(value))),
    )
  }

  return {
    values,
    ...(left.lower === undefined && right.lower === undefined
      ? {}
      : { lower: Math.max(left.lower ?? -Infinity, right.lower ?? -Infinity) }),
    ...(left.upper === undefined && right.upper === undefined
      ? {}
      : { upper: Math.min(left.upper ?? Infinity, right.upper ?? Infinity) }),
  }
}

/** Stripe stores `created` in whole seconds, so every comparison maps to an exact inclusive range. */
function createdBranch(operator: string, isReversed: boolean, value: Value): Branch {
  const milliseconds = typeof value === 'string' ? Date.parse(value) : Number.NaN

  if (Number.isNaN(milliseconds))
    throw new QueryRejected(`\`${String(value)}\` is not an RFC 3339 timestamp.`)

  const seconds = milliseconds / 1000

  // `value < created` is `created > value`.
  const flipped: Record<string, string> = {
    greaterThan: 'lessThan',
    greaterThanOrEquals: 'lessThanOrEquals',
    lessThan: 'greaterThan',
    lessThanOrEquals: 'greaterThanOrEquals',
  }

  switch (isReversed ? (flipped[operator] ?? operator) : operator) {
    case 'equals':
      return { values: new Map(), lower: Math.ceil(seconds), upper: Math.floor(seconds) }
    case 'greaterThan':
      return { values: new Map(), lower: Math.floor(seconds) + 1 }
    case 'greaterThanOrEquals':
      return { values: new Map(), lower: Math.ceil(seconds) }
    case 'lessThan':
      return { values: new Map(), upper: Math.ceil(seconds) - 1 }
    case 'lessThanOrEquals':
      return { values: new Map(), upper: Math.floor(seconds) }
    default:
      throw new NotExpressible(`\`created\` ${operator}`)
  }
}

function toSources(resource: ResourceSpec, branch: Branch): Source[] {
  if (branch.lower !== undefined && branch.upper !== undefined && branch.lower > branch.upper)
    return []

  const ids = branch.values.get('id')

  if (ids !== undefined) return ids.size === 0 ? [] : [{ kind: 'retrieve', ids: [...ids] }]

  let parameterSets: Record<string, string>[] = [
    {
      ...resource.baseListParameters,
      ...(branch.lower === undefined ? {} : { 'created[gte]': String(branch.lower) }),
      ...(branch.upper === undefined ? {} : { 'created[lte]': String(branch.upper) }),
    },
  ]

  for (const [fieldName, allowed] of branch.values) {
    const field = pushableField(resource, fieldName)

    // Stripe rejects values outside an enum parameter's domain; no record can hold them anyway.
    const values = [...allowed].filter(
      (value) => field.listValues === undefined || field.listValues.test(value),
    )

    parameterSets = parameterSets.flatMap((parameters) =>
      values.map((value) => ({ ...parameters, [field.listParameter!]: value })),
    )

    if (parameterSets.length > MAX_SOURCES) throw tooManyRequests(resource)
  }

  return parameterSets.map((parameters) => ({ kind: 'list', parameters }))
}

/** Ids constrained at the top level, so every candidate can be retrieved directly. */
function topLevelIds(filter: FilterSerialized | undefined): string[] | undefined {
  let ids: Set<string> | undefined

  for (const conjunct of conjuncts(filter)) {
    let values: readonly Value[] | undefined

    if (conjunct.in?.field === 'id' && Array.isArray(conjunct.values)) values = conjunct.values
    else if (
      conjunct.cmp === 'equals' &&
      conjunct.left.field === 'id' &&
      conjunct.right.value !== undefined
    )
      values = [conjunct.right.value]
    else if (
      conjunct.cmp === 'equals' &&
      conjunct.right.field === 'id' &&
      conjunct.left.value !== undefined
    )
      values = [conjunct.left.value]

    if (values === undefined) continue

    const strings = values.filter((value) => typeof value === 'string')
    ids = ids === undefined ? new Set(strings) : new Set(strings.filter((value) => ids!.has(value)))
  }

  return ids === undefined ? undefined : [...ids]
}

function conjuncts(filter: FilterSerialized | undefined): FilterSerialized[] {
  if (filter === undefined) return []

  if (filter.and !== undefined) return filter.and.flatMap((child) => conjuncts(child))

  return [filter]
}

function pushableField(resource: ResourceSpec, name: string | undefined): FieldSpec {
  const field = resource.fields.find((candidate) => candidate.name === name)

  if (field === undefined || !isPushable(field))
    throw new NotExpressible(`\`${name ?? 'a value'}\``)

  return field
}

function literal(field: FieldSpec, value: Value): string {
  if (typeof value === 'object')
    throw new QueryRejected(`\`${field.name}\` cannot be compared with a structured value.`)

  return String(value)
}

function tooManyRequests(resource: ResourceSpec): QueryRejected {
  return new QueryRejected(
    `This \`${resource.name}\` filter would need more than ${MAX_SOURCES} Stripe requests.`,
  )
}
