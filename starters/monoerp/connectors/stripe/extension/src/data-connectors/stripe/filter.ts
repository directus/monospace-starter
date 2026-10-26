import type {
  FilterOperandSerialized,
  FilterOperator,
  FilterSerialized,
  MonospaceObject,
  Value,
} from '@monospace/extension-kit/data-connector'
import type { FieldSpec, ResourceSpec } from './resources'
import { QueryRejected } from '@monospace/extension-kit/data-connector'
import { comparable } from './records'

/**
 * In-memory filter evaluation, used only on candidates the plan already bounded by id: Engine can
 * wrap such reads in conditions Stripe cannot express, such as the `not` of an update assertion.
 *
 * SQL three-valued logic: `null` is UNKNOWN, and only `true` selects a record.
 */
type Truth = boolean | null

type Comparable = string | number | boolean

export function matches(
  resource: ResourceSpec,
  filter: FilterSerialized | undefined,
  record: MonospaceObject,
): boolean {
  return filter === undefined || evaluate(resource, filter, record) === true
}

function evaluate(
  resource: ResourceSpec,
  filter: FilterSerialized,
  record: MonospaceObject,
): Truth {
  if (filter.and !== undefined) {
    let result: Truth = true

    for (const child of filter.and) {
      const truth = evaluate(resource, child, record)

      if (truth === false) return false

      if (truth === null) result = null
    }

    return result
  }

  if (filter.or !== undefined) {
    let result: Truth = false

    for (const child of filter.or) {
      const truth = evaluate(resource, child, record)

      if (truth === true) return true

      if (truth === null) result = null
    }

    return result
  }

  if (filter.not !== undefined) {
    const truth = evaluate(resource, filter.not, record)

    return truth === null ? null : !truth
  }

  if (filter.in !== undefined) {
    if (!Array.isArray(filter.values)) {
      throw new QueryRejected('Stripe has no list-typed fields to test membership against.')
    }

    const field = operandField(resource, filter.in)
    const left = comparable(field.kind, operandValue(filter.in, record))

    if (left === null) return null

    let result: Truth = false

    for (const value of filter.values) {
      const right = comparable(field.kind, value)

      if (right === null) result = null
      else if (right === left) return true
    }

    return result
  }

  return compare(resource, filter.cmp, filter.left, filter.right, record)
}

function compare(
  resource: ResourceSpec,
  operator: FilterOperator,
  leftOperand: FilterOperandSerialized,
  rightOperand: FilterOperandSerialized,
  record: MonospaceObject,
): Truth {
  const field = operandField(resource, leftOperand.field === undefined ? rightOperand : leftOperand)
  const left = comparable(field.kind, operandValue(leftOperand, record))
  const right = comparable(field.kind, operandValue(rightOperand, record))

  // `field = null` is Engine's IS NULL; any other comparison with NULL is UNKNOWN.
  if (operator === 'equals' && isNullLiteral(leftOperand)) return right === null

  if (operator === 'equals' && isNullLiteral(rightOperand)) return left === null

  if (left === null || right === null) return null

  return apply(operator, left, right)
}

function apply(operator: FilterOperator, left: Comparable, right: Comparable): boolean {
  switch (operator) {
    case 'equals':
      return left === right
    case 'lessThan':
      return left < right
    case 'lessThanOrEquals':
      return left <= right
    case 'greaterThan':
      return left > right
    case 'greaterThanOrEquals':
      return left >= right
    case 'contains':
      return String(left).includes(String(right))
    case 'icontains':
      return String(left).toLowerCase().includes(String(right).toLowerCase())
    case 'startsWith':
      return String(left).startsWith(String(right))
    case 'endsWith':
      return String(left).endsWith(String(right))
  }
}

function operandField(resource: ResourceSpec, operand: FilterOperandSerialized): FieldSpec {
  if (operand.field === undefined) {
    throw new QueryRejected('A filter comparison needs at least one field operand.')
  }

  const field = resource.fields.find((candidate) => candidate.name === operand.field)

  if (field === undefined)
    throw new QueryRejected(`\`${resource.name}\` has no field \`${operand.field}\`.`)

  return field
}

function operandValue(operand: FilterOperandSerialized, record: MonospaceObject): Value {
  return operand.field === undefined ? operand.value : (record[operand.field] ?? null)
}

function isNullLiteral(operand: FilterOperandSerialized): boolean {
  return operand.field === undefined && operand.value === null
}
