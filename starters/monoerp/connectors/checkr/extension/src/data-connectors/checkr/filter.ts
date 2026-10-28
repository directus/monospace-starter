import type {
  FilterOperandSerialized,
  FilterSerialized,
  MonospaceObject,
  Value,
} from '@monospace/extension-kit/data-connector'
import { QueryRejected } from '@monospace/extension-kit/data-connector'

function operand(record: MonospaceObject, side: FilterOperandSerialized): Value {
  return side.field !== undefined ? (record[side.field] ?? null) : side.value
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function instant(value: string): number {
  return DATE_TIME.test(value) ? Date.parse(value) : Number.NaN
}

// Date-time fields travel as RFC 3339 text in any offset, so compare them as instants when both
// sides are date-times, and as plain text otherwise.
function order(left: Value, right: Value): number | undefined {
  if (left === null || right === null) return undefined

  if (typeof left === 'number' && typeof right === 'number') return left - right

  if (typeof left === 'string' && typeof right === 'string') {
    const leftTime = instant(left)
    const rightTime = instant(right)

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime

    return left < right ? -1 : left > right ? 1 : 0
  }

  return undefined
}

function equal(left: Value, right: Value): boolean {
  if (left === right) return true
  const difference = order(left, right)

  return difference === 0
}

function text(left: Value, right: Value, test: (value: string, part: string) => boolean): boolean {
  return typeof left === 'string' && typeof right === 'string' && test(left, right)
}

export function matches(record: MonospaceObject, filter: FilterSerialized | undefined): boolean {
  if (filter === undefined) return true

  if (filter.and !== undefined) return filter.and.every((child) => matches(record, child))

  if (filter.or !== undefined) return filter.or.some((child) => matches(record, child))

  if (filter.not !== undefined) return !matches(record, filter.not)

  if (filter.in !== undefined) {
    const value = operand(record, filter.in)
    const set = Array.isArray(filter.values) ? filter.values : record[filter.values.field]

    if (!Array.isArray(set)) return false

    return set.some((candidate) => equal(value, candidate))
  }

  const left = operand(record, filter.left)
  const right = operand(record, filter.right)

  switch (filter.cmp) {
    case 'equals':
      return equal(left, right)
    case 'greaterThan':
      return (order(left, right) ?? Number.NaN) > 0
    case 'greaterThanOrEquals':
      return (order(left, right) ?? Number.NaN) >= 0
    case 'lessThan':
      return (order(left, right) ?? Number.NaN) < 0
    case 'lessThanOrEquals':
      return (order(left, right) ?? Number.NaN) <= 0
    case 'contains':
      return text(left, right, (value, part) => value.includes(part))
    case 'icontains':
      return text(left, right, (value, part) => value.toLowerCase().includes(part.toLowerCase()))
    case 'startsWith':
      return text(left, right, (value, part) => value.startsWith(part))
    case 'endsWith':
      return text(left, right, (value, part) => value.endsWith(part))
    default:
      throw new QueryRejected(
        `The ${String((filter as { cmp: unknown }).cmp)} filter is not supported.`,
      )
  }
}

/**
 * The values `field` is limited to by `filter`, or `undefined` when the filter lets it take any
 * value. Only a literal `equals` or `in` on the field, reached through `and` or through an `or` whose
 * every branch limits it, counts.
 */
export function valuesOf(filter: FilterSerialized | undefined, field: string): Value[] | undefined {
  if (filter === undefined) return undefined

  if (filter.and !== undefined) {
    let values: Value[] | undefined

    for (const child of filter.and) {
      const childValues = valuesOf(child, field)

      if (childValues === undefined) continue
      values =
        values === undefined ? childValues : values.filter((value) => childValues.includes(value))
    }

    return values
  }

  if (filter.or !== undefined) {
    const branches = filter.or.map((child) => valuesOf(child, field))

    if (branches.length === 0 || branches.some((branch) => branch === undefined)) return undefined

    return [...new Set(branches.flat() as Value[])]
  }

  if (filter.in !== undefined) {
    return filter.in.field === field && Array.isArray(filter.values) ? filter.values : undefined
  }

  if (filter.cmp === 'equals') {
    if (filter.left.field === field && filter.right.field === undefined) return [filter.right.value]

    if (filter.right.field === field && filter.left.field === undefined) return [filter.left.value]
  }

  return undefined
}
