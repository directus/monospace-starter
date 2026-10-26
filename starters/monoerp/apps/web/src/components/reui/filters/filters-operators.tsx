import type {
  FilterField,
  FilterOperator,
  FilterValueType,
} from '@/components/reui/filters/filters-types'

/** What each operator says on a chip and in the operator menu. */
const LABELS = {
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is: 'is',
  is_not: 'is not',
  is_any_of: 'is any of',
  is_none_of: 'is none of',
  eq: 'equals',
  neq: 'does not equal',
  gt: 'is greater than',
  gte: 'is greater than or equal to',
  lt: 'is less than',
  lte: 'is less than or equal to',
  between: 'is between',
  not_between: 'is not between',
  empty: 'is empty',
  not_empty: 'is not empty',
} as const

function operator(
  value: keyof typeof LABELS,
  clause: FilterOperator['clause'],
  more: Pick<FilterOperator, 'arity' | 'clauseValue' | 'inverse'> = {},
): FilterOperator {
  return { value, label: LABELS[value], arity: 'one', clause, ...more }
}

const EMPTY = operator('empty', '_null', { arity: 'none', clauseValue: true, inverse: 'not_empty' })

const NOT_EMPTY = operator('not_empty', '_null', {
  arity: 'none',
  clauseValue: false,
  inverse: 'empty',
})

/**
 * Operators per value type: what each says, how many values it takes, the
 * Monospace operator it runs as, and its inverse. `arity` of "none" drops the
 * chip's value segment and the value step.
 */
export const DEFAULT_FILTER_OPERATORS: Record<FilterValueType, FilterOperator[]> = {
  text: [
    operator('contains', '_icontains', { inverse: 'not_contains' }),
    operator('not_contains', '_nicontains', { inverse: 'contains' }),
    operator('starts_with', '_starts_with'),
    operator('ends_with', '_ends_with'),
    operator('is', '_eq', { inverse: 'is_not' }),
    operator('is_not', '_neq', { inverse: 'is' }),
    EMPTY,
    NOT_EMPTY,
  ],
  number: [
    operator('eq', '_eq', { inverse: 'neq' }),
    operator('neq', '_neq', { inverse: 'eq' }),
    operator('gt', '_gt', { inverse: 'lte' }),
    operator('gte', '_gte', { inverse: 'lt' }),
    operator('lt', '_lt', { inverse: 'gte' }),
    operator('lte', '_lte', { inverse: 'gt' }),
    operator('between', '_between', { arity: 'range', inverse: 'not_between' }),
    operator('not_between', '_nbetween', { arity: 'range', inverse: 'between' }),
    EMPTY,
    NOT_EMPTY,
  ],
  select: [
    operator('is', '_eq', { inverse: 'is_not' }),
    operator('is_not', '_neq', { inverse: 'is' }),
    operator('is_any_of', '_in', { arity: 'many', inverse: 'is_none_of' }),
    operator('is_none_of', '_nin', { arity: 'many', inverse: 'is_any_of' }),
    EMPTY,
    NOT_EMPTY,
  ],
}

export const DEFAULT_FILTER_VALUE_TYPE: FilterValueType = 'text'

/** The operators for a field: its own `operators`, otherwise the catalog's for its `type`. */
export function resolveFilterOperators<V, O>(field: FilterField<V, O>): FilterOperator[] {
  return field.operators ?? DEFAULT_FILTER_OPERATORS[field.type ?? DEFAULT_FILTER_VALUE_TYPE]
}

export function visibleFilterOperators(operators: readonly FilterOperator[]): FilterOperator[] {
  return operators.filter((operator) => !operator.hidden)
}

export function getFilterOperator(
  operators: readonly FilterOperator[],
  value: string | null | undefined,
): FilterOperator | undefined {
  if (!value) return undefined

  return operators.find((operator) => operator.value === value)
}

export function getFilterArity(operator: FilterOperator | undefined): FilterOperator['arity'] {
  return operator?.arity ?? 'one'
}

export function operatorTakesValue(operator: FilterOperator | undefined): boolean {
  return getFilterArity(operator) !== 'none'
}

/**
 * The operator a field starts with: `defaultOperator` when it names one the
 * field offers, otherwise the first visible operator. Falling back rather than
 * trusting the schema keeps the rule out of a state its own list cannot show.
 */
export function getDefaultFilterOperator<V, O>(
  field: FilterField<V, O>,
  operators: readonly FilterOperator[],
): string | null {
  if (field.defaultOperator) {
    const named = getFilterOperator(operators, field.defaultOperator)

    if (named) return named.value
  }

  const visible = visibleFilterOperators(operators)

  return visible[0]?.value ?? operators[0]?.value ?? null
}

/**
 * Negating a rule: swap to the declared `inverse` so the chip reads "does not
 * contain", else toggle `negated` so Negate still works without an inverse.
 */
export interface NegatedFilterOperator {
  operator: string | null
  negated: boolean
}

export function negateFilterOperator(
  operator: FilterOperator | undefined,
  operators: readonly FilterOperator[],
  negated: boolean | undefined,
): NegatedFilterOperator {
  if (operator?.inverse) {
    const inverse = getFilterOperator(operators, operator.inverse)

    if (inverse) return { operator: inverse.value, negated: Boolean(negated) }
  }

  return { operator: operator?.value ?? null, negated: !negated }
}

/**
 * Reshapes a value when arity changes: widening "is" to "is any of" keeps what
 * the user picked, narrowing keeps the first of them, `"none"` always drops it.
 */
export function coerceFilterValue<V>(
  value: V | undefined,
  from: FilterOperator | undefined,
  to: FilterOperator | undefined,
): V | undefined {
  const nextArity = getFilterArity(to)

  if (nextArity === 'none') return undefined

  if (value === undefined || value === null) return value

  if (getFilterArity(from) === nextArity) return value

  const values: ReadonlyArray<unknown> = Array.isArray(value) ? value : [value]

  const next =
    nextArity === 'many' ? values : nextArity === 'one' ? values[0] : [values[0], values[1]]

  // SAFETY: a rule's value type holds a single value, a list of them, or a [from, to] pair, since
  // that's how the editors store "one", "many", and "range" (`FilterValue` in lib/filters.tsx).
  return next as V
}
