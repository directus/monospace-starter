import type {
  FilterField,
  FilterIndex,
  FilterOperator,
  FilterOption,
} from '@/components/filters/types'

export const FILTER_MENU_CLASS =
  'w-max min-w-32 max-w-[min(24rem,calc(100vw-2rem))] [&_[data-slot=dropdown-menu-item]]:min-w-0'

export const FILTER_MENU_LABEL_CLASS = 'min-w-0 truncate'

export const FILTER_FIELD_PICKER_CLASS = 'w-auto min-w-56 p-0'

const PATH_SEPARATOR = '\u0000'

export function joinFilterPath(path: readonly string[]): string {
  return path.join(PATH_SEPARATOR)
}

// Inline field arrays are common. A content signature avoids rebuilding the label index on a keystroke.
export function computeFilterSchemaSignature<V, O>(fields: readonly FilterField<V, O>[]): string {
  return fields
    .map((field) =>
      [
        field.id,
        field.label,
        field.type,
        field.defaultOperator,
        field.disabled,
        field.icon ? 'icon' : '',
        field.editor ? 'editor' : '',
        field.loadOptions ? 'load' : '',
        field.resolveValues ? 'resolve' : '',
        field.keywords?.join(','),
        field.options
          ?.map((option) => `${option.value}~${option.label}~${option.exclusive}`)
          .join(','),
        field.operators?.map((operator) => operator.value).join(','),
      ].join('|'),
    )
    .join('\n')
}

export function buildFilterIndex<V = unknown, O = unknown>(
  fields: readonly FilterField<V, O>[],
  previous?: FilterIndex<V, O> | null,
  precomputedSignature?: string,
): FilterIndex<V, O> {
  const signature = precomputedSignature ?? computeFilterSchemaSignature(fields)

  if (previous?.signature === signature) return previous
  const byPath = new Map<string, FilterField<V, O>>()
  const all: { field: FilterField<V, O>; path: string[] }[] = []

  for (const field of fields) {
    if (byPath.has(field.id)) continue
    byPath.set(field.id, field)
    all.push({ field, path: [field.id] })
  }

  return { byPath, all, roots: all.map(({ field }) => field), signature }
}

export function getFilterField<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[],
): FilterField<V, O> | undefined {
  return path.length === 1 ? index.byPath.get(path[0]) : undefined
}

export function formatFilterPath<V, O>(
  index: FilterIndex<V, O>,
  path: readonly string[],
  separator: string,
): string {
  return getFilterField(index, path)?.label ?? path.join(separator)
}

function foldFilterText(text: string): string {
  return text.toLocaleLowerCase()
}

export function normalizeFilterQuery(query: string): string {
  return foldFilterText(query.trim())
}

export function filterFilterOptions<O>(
  options: readonly FilterOption<O>[],
  normalizedQuery: string,
): readonly FilterOption<O>[] {
  if (normalizedQuery === '') return options

  return options.filter((option) => {
    if (foldFilterText(option.label).includes(normalizedQuery)) return true

    if (option.keywords) {
      for (const keyword of option.keywords) {
        if (foldFilterText(keyword).includes(normalizedQuery)) return true
      }
    }

    return false
  })
}

export function applyFilterExclusiveSelection(
  next: readonly string[],
  previous: readonly string[],
  isExclusive: (value: string) => boolean,
): readonly string[] {
  const held = new Set(previous)
  const added = next.filter((value) => !held.has(value))

  if (added.length === 0) return next

  let arrived: string | null = null

  for (const value of added) {
    if (isExclusive(value)) arrived = value
  }

  if (arrived !== null) return [arrived]

  const kept = next.filter((value) => !isExclusive(value))

  // The same array when nothing was exclusive, which is nearly every call: a
  // fresh one would commit a new value on every toggle of an ordinary row.
  return kept.length === next.length ? next : kept
}

export function createFilterIdFactory(seed: string): () => string {
  let counter = 0

  return () => {
    counter += 1

    return `${seed}${counter}`
  }
}

const warned = new Set<string>()

export function warnFilterOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === 'production') return

  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[filters] ${message}`)
}

interface FilterSchemaIssues {
  duplicatePaths: string[]
  emptyIds: string[]
  unknownDefaultOperators: string[]
}

export function findFilterSchemaIssues<V, O>(
  fields: readonly FilterField<V, O>[],
  resolveOperators: (field: FilterField<V, O>) => FilterOperator[],
): FilterSchemaIssues {
  const duplicatePaths: string[] = []
  const emptyIds: string[] = []
  const unknownDefaultOperators: string[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    if (!field.id) emptyIds.push(field.id)
    else if (seen.has(field.id)) duplicatePaths.push(field.id)
    seen.add(field.id)

    if (
      field.defaultOperator &&
      !resolveOperators(field).some((operator) => operator.value === field.defaultOperator)
    ) {
      unknownDefaultOperators.push(`${field.id} -> ${field.defaultOperator}`)
    }
  }

  return { duplicatePaths, emptyIds, unknownDefaultOperators }
}
