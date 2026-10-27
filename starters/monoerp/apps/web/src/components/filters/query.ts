import type { FilterQuery, FilterRule } from '@/components/filters/types'

export function createFilterRule<V = unknown>(input: {
  id: string
  path: string[]
  operator: string
  value?: V
  negated?: boolean
}): FilterRule<V> {
  const rule: FilterRule<V> = {
    id: input.id,
    type: 'rule',
    path: input.path,
    operator: input.operator,
    value: input.value,
  }

  if (input.negated) rule.negated = true

  return rule
}

export function createFilterQuery<V = unknown>(rules: FilterRule<V>[] = []): FilterQuery<V> {
  return { rules }
}

export function flattenFilterRules<V>(query: FilterQuery<V>): FilterRule<V>[] {
  return query.rules
}

export function countFilterRules<V>(query: FilterQuery<V>): number {
  return query.rules.length
}

export function isFilterQueryEmpty<V>(query: FilterQuery<V>): boolean {
  return query.rules.length === 0
}

export function findFilterRule<V>(query: FilterQuery<V>, id: string): FilterRule<V> | null {
  return query.rules.find((rule) => rule.id === id) ?? null
}

export function updateFilterRule<V>(
  query: FilterQuery<V>,
  id: string,
  updates: Partial<Omit<FilterRule<V>, 'id' | 'type'>>,
): FilterQuery<V> {
  if (!findFilterRule(query, id)) return query

  return { rules: query.rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)) }
}

export function removeFilterRule<V>(query: FilterQuery<V>, id: string): FilterQuery<V> {
  if (!findFilterRule(query, id)) return query

  return { rules: query.rules.filter((rule) => rule.id !== id) }
}

export function insertFilterRule<V>(query: FilterQuery<V>, rule: FilterRule<V>): FilterQuery<V> {
  return { rules: [...query.rules, rule] }
}

export function duplicateFilterRule<V>(
  query: FilterQuery<V>,
  id: string,
  nextId: () => string,
): FilterQuery<V> {
  const index = query.rules.findIndex((rule) => rule.id === id)

  if (index < 0) return query
  const rules = [...query.rules]
  rules.splice(index + 1, 0, { ...rules[index], id: nextId() })

  return { rules }
}

export function clearFilterQuery<V>(query: FilterQuery<V>): FilterQuery<V> {
  return query.rules.length ? { rules: [] } : query
}
