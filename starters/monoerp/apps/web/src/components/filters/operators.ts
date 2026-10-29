import type { FilterField, FilterOperator, FilterValueType } from '@/components/filters/types'
import { appCopy } from '@/lib/app.copy'

function operator(
  value: keyof typeof appCopy.filters.operators,
  clause: FilterOperator['clause'],
  more: Pick<FilterOperator, 'arity' | 'clauseValue' | 'inverse'> = {},
): FilterOperator {
  return { value, label: appCopy.filters.operators[value], arity: 'one', clause, ...more }
}

const EMPTY = operator('empty', '_null', { arity: 'none', clauseValue: true, inverse: 'not_empty' })

const NOT_EMPTY = operator('not_empty', '_null', {
  arity: 'none',
  clauseValue: false,
  inverse: 'empty',
})

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

const DEFAULT_FILTER_VALUE_TYPE: FilterValueType = 'text'

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

interface NegatedFilterOperator {
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
