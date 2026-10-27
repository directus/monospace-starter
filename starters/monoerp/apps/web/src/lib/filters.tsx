import { format } from 'date-fns'
import { z } from 'zod'

import { resolveFilterDate } from '@/components/filters/date'
import type { FilterField, FilterOption, FilterQuery, FilterRule } from '@/components/filters/types'
import { RelationOptionVisual } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { createFilterQuery } from '@/components/filters/filters'
import { getFilterOperator, resolveFilterOperators } from '@/components/filters/operators'
import type { Uuid } from '@/generated/monospace'
import { isUuid } from '@/lib/uuid'

// List filters are flat AND rules, kept in the URL with readable
// operator names, and turned into Monospace filter clauses here. A page declares its fields with
// `ListFilterField`, which adds where each one lives in Monospace on top of the field config.

// A Monospace filter clause: field paths nesting down to one operator (`{ status: { _eq: 'x' } }`),
// or `_and` / `_or` lists of clauses.
type ClauseValue = string | boolean | Array<string | boolean> | FilterClause | Array<FilterClause>

export const EMPTY_FILTERS = createFilterQuery<FilterValue>([])

export type FilterClause = { [key: string]: ClauseValue }

export type ListFilterField = FilterField<FilterValue> & {
  // Monospace field the clause applies to. Defaults to `id`. Dotted paths nest.
  path?: string
  // Escape hatch for clauses that don't fit a single path (e.g. `_some` on a relation).
  toClause?: (clause: FilterClause) => FilterClause
  // How to serialise values: `date` fields carry date tokens, `number` fields numbers.
  kind?: 'text' | 'number' | 'date' | 'option' | 'boolean'
}

// A date rule's value: an absolute day or a relative token, optionally with a time.
export const filterDateValue = z.object({
  date: z.string().optional(),
  relative: z
    .object({ unit: z.enum(['day', 'week', 'month', 'year']), offset: z.number() })
    .optional(),
  time: z.string().optional(),
})

// What filter editors write into a rule: text, a number, yes/no, a date, or a list of those (option
// ids, a range). A range end left blank is undefined in memory and null once it's been through JSON.
const filterScalar = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
  filterDateValue,
])

const filterValue = z.union([filterScalar, z.array(filterScalar)])

export type FilterValue = z.infer<typeof filterValue>

// Text and number operators take a single typed-in value.
const filterText = z.union([z.string(), z.number()])

export type ListFilterQuery = FilterQuery<FilterValue>

const ruleSchema = z
  .object({
    id: z.string(),
    type: z.literal('rule'),
    path: z.array(z.string()),
    operator: z.string(),
    value: filterValue.optional(),
    negated: z.boolean().optional(),
  })
  // reUI's rules always carry a `value` key, even when it's empty.
  .transform((rule) => ({ ...rule, value: rule.value }))

// Reject old group/combinator URLs instead of silently changing their meaning.
export const filterQuerySchema = z.strictObject({ rules: z.array(ruleSchema) })

function nest(path: string, leaf: FilterClause) {
  return path
    .split('.')
    .reverse()
    .reduce<FilterClause>((inner, key) => ({ [key]: inner }), leaf)
}

function dateText(value: FilterValue) {
  const date = resolveFilterDate(filterDateValue.safeParse(value).data)

  return date ? format(date, 'yyyy-MM-dd') : null
}

function serialise(field: ListFilterField, value: FilterValue): string | boolean | null {
  if (value === undefined || value === null || value === '') return null
  const kind = field.kind ?? (field.type === 'number' ? 'number' : 'text')

  if (kind === 'date') return dateText(value)

  if (kind === 'boolean') return Boolean(value)

  const text = filterText.safeParse(value)

  if (!text.success) return null

  if (kind === 'number') return Number.isFinite(Number(text.data)) ? String(text.data) : null

  return String(text.data)
}

// One rule -> the operator clause for its field, or null when the rule is incomplete or its
// operator isn't one the field offers. Each operator carries the Monospace operator it runs as.
export function operatorClause(
  field: ListFilterField,
  rule: FilterRule<FilterValue>,
): FilterClause | null {
  const operator = getFilterOperator(resolveFilterOperators(field), rule.operator)

  if (!operator) return null
  const arity = operator.arity ?? 'one'

  if (arity === 'none') return { [operator.clause]: operator.clauseValue ?? true }
  const raw = Array.isArray(rule.value) ? rule.value : [rule.value]
  const values = raw.map((value) => serialise(field, value)).filter((value) => value !== null)
  const [first, second] = values

  if (first === undefined) return null

  if (arity === 'range') return second === undefined ? null : { [operator.clause]: [first, second] }

  if (arity === 'many') return { [operator.clause]: values }

  return { [operator.clause]: first }
}

function ruleClause(fields: ReadonlyArray<ListFilterField>, rule: FilterRule<FilterValue>) {
  const field = fields.find((candidate) => candidate.id === rule.path[0])

  if (!field) return null
  const clause = operatorClause(field, rule)

  if (!clause) return null
  const scoped = field.toClause ? field.toClause(clause) : nest(field.path ?? field.id, clause)

  return rule.negated ? { _not: scoped } : scoped
}

// Incomplete and unknown rules do not restrict the list.
export function filtersToClause(
  fields: ReadonlyArray<ListFilterField>,
  query: ListFilterQuery | undefined,
) {
  const clauses = query?.rules.flatMap((rule) => {
    const clause = ruleClause(fields, rule)

    return clause ? [clause] : []
  })

  return clauses?.length ? { _and: clauses } : undefined
}

// Whether the query holds a complete rule for a field (e.g. to drop a redundant column).
export function hasRuleFor(
  fields: ReadonlyArray<ListFilterField>,
  query: ListFilterQuery | undefined,
  id: string,
) {
  if (!query) return false

  return query.rules.some((rule) => rule.path[0] === id && ruleClause(fields, rule) !== null)
}

// Replace (or add) the single rule for a field, e.g. "owner is any of [me]" from a shortcut.
export function withRule(
  query: ListFilterQuery | undefined,
  fieldId: string,
  operator: string,
  value: FilterValue,
): ListFilterQuery {
  const base = query ?? createFilterQuery<FilterValue>([])
  const rules = base.rules.filter((node) => node.type !== 'rule' || node.path[0] !== fieldId)

  return {
    ...base,
    rules: [
      ...rules,
      { id: `${fieldId}-${Date.now()}`, type: 'rule', path: [fieldId], operator, value },
    ],
  }
}

function toFilterOption(option: RelationOption): FilterOption {
  return {
    value: option.value,
    label: option.label,
    description: option.description,
    icon:
      option.image || option.avatar || option.variant || option.color ? (
        <RelationOptionVisual option={option} />
      ) : undefined,
  }
}

// A field backed by a Monospace lookup: searches as the user types, and resolves ids from the URL
// back to labels. URL ids are untrusted text, so malformed ones are dropped before the lookup.
export function relationField({
  search,
  resolve,
  ...field
}: Omit<ListFilterField, 'type' | 'loadOptions' | 'resolveValues'> & {
  search: (q: string) => Promise<Array<RelationOption>>
  resolve: (ids: Array<Uuid>) => Promise<Array<RelationOption>>
}): ListFilterField {
  return {
    type: 'select',
    defaultOperator: 'is_any_of',
    kind: 'option',
    pinSelected: true,
    loadOptions: (q) => search(q).then((rows) => rows.map(toFilterOption)),
    resolveValues: (ids) => resolve(ids.filter(isUuid)).then((rows) => rows.map(toFilterOption)),
    ...field,
  }
}

export { createFilterQuery, isFilterQueryEmpty } from '@/components/filters/query'
