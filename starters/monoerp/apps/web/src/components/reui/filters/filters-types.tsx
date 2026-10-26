// Title: Filters
// Description: Stepped filter builder with nested fields, popover value editors and a boolean query tree.

import type * as React from 'react'

/* -------------------------------------------------------------------------- */
/*                                 Query tree                                 */
/* -------------------------------------------------------------------------- */

export type FilterCombinator = 'and' | 'or'

/**
 * One condition. `path` maps one to one onto the cascader's `details.path`, so
 * a field selection commits untranslated. `value` is SINGULAR and the
 * operator's `arity` decides its shape: `"many"` holds an array, `"range"` a
 * tuple, `"none"` undefined.
 */
export interface FilterRule<V = unknown> {
  id: string
  type: 'rule'
  /** Field path, root first. `["name", "first"]` for a nested attribute. */
  path: string[]
  operator: string
  value: V | undefined
  /** Flips the meaning in place. Set by Negate when there is no `inverse`. */
  negated?: boolean
}

/** Rules under one combinator; nests, so nesting is never a later break. */
export interface FilterGroupNode<V = unknown> {
  id: string
  type: 'group'
  combinator: FilterCombinator
  rules: FilterNode<V>[]
}

export type FilterNode<V = unknown> = FilterRule<V> | FilterGroupNode<V>

/** A whole query. Always a group, so flat and nested are one code path. */
export type FilterQuery<V = unknown> = FilterGroupNode<V>

export type FilterChangeReason = 'add' | 'update' | 'remove' | 'duplicate' | 'negate' | 'clear'

/** Second argument to `onQueryChange`, so nobody has to diff two trees. */
export interface FilterChangeDetails<V = unknown, O = unknown> {
  reason: FilterChangeReason
  /** The rule that changed, or null for whole-query changes like `clear`. */
  rule: FilterRule<V> | null
  /** The field the rule points at, resolved. Null when the path is unknown. */
  field: FilterField<V, O> | null
}

/* -------------------------------------------------------------------------- */
/*                                  Operators                                 */
/* -------------------------------------------------------------------------- */

/**
 * How many values an operator takes. Answers "does this need a value editor"
 * for every operator, a consumer's own included, in place of the hardcoded
 * `operator === "empty"` checks it replaced.
 */
export type FilterOperatorArity = 'none' | 'one' | 'many' | 'range'

/** The Monospace filter operators a rule can turn into. */
export type FilterClauseOperator =
  | '_eq'
  | '_neq'
  | '_in'
  | '_nin'
  | '_icontains'
  | '_nicontains'
  | '_starts_with'
  | '_ends_with'
  | '_gt'
  | '_gte'
  | '_lt'
  | '_lte'
  | '_between'
  | '_nbetween'
  | '_null'

export interface FilterOperator {
  value: string
  label: string
  /** Defaults to `"one"`. */
  arity?: FilterOperatorArity
  /** The Monospace operator this one runs as, so every offered operator is one Monospace can run. */
  clause: FilterClauseOperator
  /** The value sent for an operator that takes none: `_null: true` is "is empty". */
  clauseValue?: boolean
  /** The opposite operator. Negate flips to it, else sets `rule.negated`. */
  inverse?: string
  /** Hidden from the operator list but still valid in a restored query. */
  hidden?: boolean
}

/* -------------------------------------------------------------------------- */
/*                                   Fields                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which built-in editor a field uses by DEFAULT: `editor` overrides it, and an
 * operator may override both. No date type on purpose - every product wants a
 * different date control, and a built-in one would add a calendar dependency to
 * every install, so a date ships as an `editor`.
 */
export type FilterValueType = 'text' | 'number' | 'select'

export interface FilterOption<O = unknown> {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  disabled?: boolean
  /**
   * The row that means NONE OF THE ABOVE: Unassigned, No label, No due date.
   * Picking it clears every other pick and picking anything else clears it, and
   * it is drawn apart under a rule of its own, because a list that wipes a
   * selection must not look like one that does not; hide that line with
   * `"[&_[data-slot=filter-menu-divider]]:hidden"`. Applied under EVERY
   * operator, negative ones included. The value must be RESOLVABLE, since the
   * rule runs through the option service: an option that exists only in an
   * unfetched `loadOptions` page is invisible to it.
   */
  exclusive?: boolean
  /** Arbitrary payload, carried untouched through every render callback. */
  data?: O
}

export interface FilterLoadContext {
  /** Aborted when the query changes, the editor closes, or a load supersedes. */
  signal: AbortSignal
  cursor?: string
}

/** Result of `loadOptions`, or a bare array. Shape-locked to the cascader. */
export interface FilterLoadResult<O = unknown> {
  items: FilterOption<O>[]
  nextCursor?: string
  /** Defaults to whether `nextCursor` was supplied. */
  hasMore?: boolean
}

/** A field, or a branch. A group is a field with `fields`, not `selectable`. */
export interface FilterField<V = unknown, O = unknown> {
  /** Stable id. Unique among its siblings; the full path must be unique. */
  id: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  /** Trailing count. Defaults to known children; set it when they are lazy. */
  count?: number
  fields?: FilterField<V, O>[]
  /** Whether a BRANCH is itself filterable. Leaves always are. */
  selectable?: boolean
  disabled?: boolean

  type?: FilterValueType
  options?: FilterOption<O>[]
  /** Async options, paged via `cursor`. Any `options` also seed the cache. */
  loadOptions?: (
    query: string,
    context: FilterLoadContext,
  ) => FilterOption<O>[] | Promise<FilterOption<O>[] | FilterLoadResult<O>>
  /** Resolves stored values the loader never returned, for restored chips. */
  resolveValues?: (values: string[]) => FilterOption<O>[] | Promise<FilterOption<O>[]>

  /** Operators for this field. Falls back to the catalog for its `type`. */
  operators?: FilterOperator[]
  defaultOperator?: string

  /** Overrides the editor chosen from `type`. See `FilterEditorProps`. */
  editor?: FilterEditorRef<V, O>
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  /** The value as PLAIN TEXT for a11y; the default is `String(value)`. */
  valueText?: (context: FilterValueDisplayContext<V, O>) => string

  /** Placeholder for the value editor's input, or an option list's search. */
  placeholder?: string
  /** SHOWS the search box (default true). Off keeps it, hidden: it owns focus. */
  searchable?: boolean
  /**
   * Whether an option-backed editor STACKS the picks at the top of its list.
   * Off by default, because a short closed list is read as a whole and lifting
   * a row out of a memorised order costs more than it buys. The partition is
   * taken LIVE unless `sortSelected: "snapshot"`, so ticking a row moves the
   * rows below it and the highlight is carried across by VALUE. Exclusive
   * options never join the stack; they are grouped by ROLE.
   */
  pinSelected?: boolean
  /**
   * How an option list is ordered INSIDE each group, plus WHEN the partition is
   * taken under `pinSelected`. With pinning off there is no partition, so
   * `"snapshot"` is the same thing as `"none"`.
   *
   * - `"none"` (default) keeps declaration order. Not alphabetical, because
   *   option order is usually semantic (To do, In progress, Done).
   * - `"label"` sorts with `localeCompare`, so "Ålesund" files next to
   *   "Alesund" rather than after "Zurich".
   * - `"snapshot"` keeps declaration order too, and freezes the partition as
   *   the menu opened it: a steady pointer target where the other two re-pin
   *   live.
   */
  sortSelected?: 'none' | 'label' | 'snapshot'
  /**
   * Reaches the value editor's PANEL. Merged last through tailwind-merge, so a
   * `w-*` here beats the default rather than losing to it on source order.
   *
   * HEIGHT IS A VARIABLE, NOT A UTILITY: a `max-h-*` here bounds the PANEL and
   * does nothing to the list inside it, which owns its own `max-height`. Write
   * `--cascader-max-height: 28rem` as an arbitrary property instead; the cap is
   * the SMALLER of that and the space the popup has.
   */
  className?: string

  /** The storage column when it differs from the UI path. Never read here. */
  column?: string
  data?: unknown
}

/* -------------------------------------------------------------------------- */
/*                                   Editors                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where an editor renders. The SAME component serves both: `"create"` is the
 * wizard step, which has Back and advances on commit, `"amend"` the
 * chip-anchored popover, which offers Discard instead.
 */
export type FilterEditorHost = 'create' | 'amend'

export interface FilterOptionsState<O = unknown> {
  items: readonly FilterOption<O>[]
  loading: boolean
  error: boolean
  hasMore: boolean
  /** Current search text. Debounced before it reaches `loadOptions`. */
  query: string
  setQuery: (query: string) => void
  loadMore: () => void
  retry: () => void
  /** Resolves a stored value to its option, from cache when possible. */
  resolve: (value: string) => FilterOption<O> | undefined
}

export interface FilterCommitOptions {
  /** Dismiss the host after writing. Defaults to true. */
  close?: boolean
}

export interface FilterEditorProps<V = unknown, O = unknown> {
  field: FilterField<V, O>
  operator: FilterOperator
  /** The DRAFT value. An editor edits a draft; the host commits it. */
  value: V | undefined
  onValueChange: (value: V | undefined) => void
  host: FilterEditorHost
  /**
   * Spread onto whichever element should take focus, so no editor reaches for
   * `setTimeout`. A CALLBACK ref at `HTMLElement` is the one shape assignable
   * to every element's own ref prop, so it spreads onto an input, a slider or a
   * button without a cast.
   */
  autoFocusProps: {
    ref: React.RefCallback<HTMLElement>
    autoFocus: boolean
  }
  /** Accept the draft. `{ close: false }` writes through without dismissing. */
  commit: (value?: V, options?: FilterCommitOptions) => void
  cancel: () => void
  /** Step back. Only meaningful when `host === "create"`. */
  back: () => void
  options: FilterOptionsState<O>
  labels: FilterLabels
}

export type FilterEditor<V = unknown, O = unknown> = React.ComponentType<FilterEditorProps<V, O>>

/**
 * An editor with its generics erased, for the registry. `unknown` rather than
 * `never`: props are contravariant, so a `FilterEditor<never, never>` registry
 * accepts nothing at all. The single widening cast happens where it renders.
 */
export type AnyFilterEditor = React.ComponentType<FilterEditorProps<unknown, unknown>>

export type FilterEditorRegistry = Record<string, AnyFilterEditor>

/**
 * A field's own value editor. The `any` arm lets a CONCRETE
 * editor sit on an unknown-typed field without a cast: props are contravariant,
 * so `FilterEditor<DateValue>` is not a `FilterEditor<unknown>`. The widening
 * happens once, inside `resolveFilterEditor`.
 */
export type FilterEditorRef<V = unknown, O = unknown> =
  | FilterEditor<V, O>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FilterEditor<any, any>

export interface FilterValueDisplayContext<V = unknown, O = unknown> {
  value: V | undefined
  /** `value` normalised to an array, so callbacks never re-derive it. */
  values: unknown[]
  field: FilterField<V, O>
  operator: FilterOperator
  /** Options already resolved for `value`, when the field is option-backed. */
  options: FilterOption<O>[]
  labels: FilterLabels
}

/* -------------------------------------------------------------------------- */
/*                                   Index                                    */
/* -------------------------------------------------------------------------- */

/** Normalized schema, keyed by SIGNATURE: call sites inline the array. */
export interface FilterIndex<V = unknown, O = unknown> {
  /** Every field by its joined path, `"name.first"`. */
  byPath: Map<string, FilterField<V, O>>
  /** Child fields by parent path. Root fields are keyed by `FILTER_ROOT_KEY`. */
  childrenOf: Map<string, FilterField<V, O>[]>
  /** Parent path by path. Empty string for a root field. */
  parentOf: Map<string, string>
  /** Every field in stable, depth-first order. Deep search walks it, and the
   * builder seeds a new row from the FIRST pickable entry, so order is load
   * bearing, not incidental. */
  all: { field: FilterField<V, O>; path: string[] }[]
  /** Top level fields, in input order. */
  roots: FilterField<V, O>[]
  /** Content hash; equal schemas share one, so a rebuild reuses the index. */
  signature: string
}

/* -------------------------------------------------------------------------- */
/*                                    Draft                                   */
/* -------------------------------------------------------------------------- */

export type FilterDraftStep = 'field' | 'operator' | 'value'

/**
 * The in-flight filter. `cascaderPath` is kept SEPARATE from `path`: `path` is
 * what the user chose, `cascaderPath` is where they were browsing when they
 * chose it, and Back has to return there. Deriving it from `path` breaks the
 * moment a deep search jumps across the tree.
 */
export interface FilterDraft<V = unknown> {
  step: FilterDraftStep
  /** `"ready"` = complete: the host writes it into the query and closes. The
   * pure reducer decides that, not a click handler. */
  status: 'editing' | 'ready'
  /** Set when amending an existing rule, null when creating a new one. */
  ruleId: string | null
  /** The chosen field path. Empty until the field step commits. */
  path: string[]
  cascaderPath: string[]
  operator: string | null
  value: V | undefined
  query: string
}

/* -------------------------------------------------------------------------- */
/*                                   Labels                                   */
/* -------------------------------------------------------------------------- */

/** Every user facing string. `stepAnnouncement` alone is headless-only. */
export interface FilterLabels {
  addFilter: string
  groupAnnouncement: (added: boolean) => string
  clearAll: string
  searchFields: string
  searchOperators: string
  searchOptions: string
  back: string
  clear: string
  apply: string
  discard: string
  empty: string
  loading: string
  loadingMore: string
  loadMore: string
  error: string
  retry: string
  duplicate: string
  negate: string
  remove: string
  /** Names a chip's menu button. The builder's row menu reads the same key. */
  chipMenu: (fieldLabel: string) => string
  filtersLabel: string
  filterLabel: (condition: string) => string
  /** Prose, not ARIA: `aria-readonly` is invalid on toolbar, group and button. */
  readOnly: string
  /** Joins ancestors in a nested field path, "Name > First", for the names
   * `formatFilterPath` builds. The chip draws a decorative chevron instead. */
  pathSeparator: string
  valuePlaceholder: string
  /** Empty word for an OPTION value; `placeholder` is the search prompt. */
  selectPlaceholder: string
  /** Spoken for an empty value: "contains enter text..." is not a name. */
  noValue: string
  /** Shown in the operator segment before a condition has been chosen. */
  selectCondition: string
  /** Appended to a chip with no condition, matching the dashed outline. */
  incomplete: string
  /** Appended to a branch row's accessible name in the field picker. */
  branchAffordance: string
  /** A FRAGMENT, appended after a comma to an exclusive row's accessible name.
   * Warns before the press; `exclusiveAnnouncement` is the receipt after. */
  exclusiveHint: string
  /** The clearing moves nothing on screen, so it is otherwise silent. */
  exclusiveAnnouncement: (label: string, cleared: number) => string
  itemCount: (count: number) => string
  fieldsLabel: string
  /** Live-region text after a query narrows an option list or the picker. */
  resultsAnnouncement: (count: number) => string
  /** Accessible name of an option menu's footer (Load more, Retry). */
  actionsLabel: string
  countAnnouncement: (count: number) => string
  valueCount: (count: number) => string
  /** Spells out the list behind the `valueCount` summary, and contains it. */
  valueDetail: (summary: string, values: string[]) => string
  valueRange: (from: string, to: string) => string
  rangeFrom: (fieldLabel: string) => string
  rangeTo: (fieldLabel: string) => string
  rangeSeparator: string
  /** Rendered for a `negated` rule, wrapping the operator label. */
  negated: (operatorLabel: string) => string
}
