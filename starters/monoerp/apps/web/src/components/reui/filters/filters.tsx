import * as React from 'react'
import {
  createFilterFocusStore,
  createFilterResolutionStore,
  FilterActionsContext,
  FilterFocusContext,
  FilterRenderContext,
  FilterStateContext,
  isFilterLocked,
  type FilterActionsContextValue,
  type FilterRenderContextValue,
  type FilterStateContextValue,
} from '@/components/reui/filters/filters-context'
import {
  filterDraftReducer,
  isFilterDraftCommittable,
  type FilterDraftAction,
} from '@/components/reui/filters/filters-draft'
import {
  DEFAULT_FILTER_EDITORS,
  resolveFilterEditor,
  type FilterEditorRegistry,
} from '@/components/reui/filters/filters-editors'
import { resolveFilterLabels } from '@/components/reui/filters/filters-i18n'
import {
  buildFilterIndex,
  computeFilterSchemaSignature,
  createFilterIdFactory,
  findFilterSchemaIssues,
  getFilterField,
  warnFilterOnce,
  type FilterPathCollapse,
} from '@/components/reui/filters/filters-lib'
import {
  getFilterOperator,
  negateFilterOperator,
  resolveFilterOperators,
} from '@/components/reui/filters/filters-operators'
import {
  clearFilterQuery,
  countFilterRules,
  createFilterQuery,
  createFilterRule,
  duplicateFilterNode,
  findFilterNode,
  findFilterRule,
  insertFilterNode,
  removeFilterNode,
  updateFilterRule,
} from '@/components/reui/filters/filters-query'
import type {
  FilterChangeDetails,
  FilterDraft,
  FilterEditor,
  FilterField,
  FilterLabels,
  FilterQuery,
  FilterRule,
  FilterValueDisplayContext,
} from '@/components/reui/filters/filters-types'

/* -------------------------------------------------------------------------- */
/*                                 Controllable                               */
/* -------------------------------------------------------------------------- */

function useControllableQuery<V, O>(
  controlled: FilterQuery<V> | undefined,
  uncontrolledDefault: FilterQuery<V> | undefined,
  onChange: ((query: FilterQuery<V>, details: FilterChangeDetails<V, O>) => void) | undefined,
) {
  const isControlled = controlled !== undefined

  const [internal, setInternal] = React.useState<FilterQuery<V>>(
    () => uncontrolledDefault ?? createFilterQuery<V>(),
  )

  const query = isControlled ? controlled : internal
  const queryRef = React.useRef(query)
  React.useEffect(() => {
    queryRef.current = query
  })

  const setQuery = React.useCallback(
    (next: FilterQuery<V>, details: FilterChangeDetails<V, O>) => {
      if (next === queryRef.current) return
      queryRef.current = next

      if (!isControlled) setInternal(next)
      onChange?.(next, details)
    },
    [isControlled, onChange],
  )

  return { query, queryRef, setQuery }
}

/* -------------------------------------------------------------------------- */
/*                                    Root                                    */
/* -------------------------------------------------------------------------- */

export interface FiltersProps<V = unknown, O = unknown> {
  /** The field schema. Nested via each field's own `fields`. */
  fields: FilterField<V, O>[]

  query?: FilterQuery<V>
  defaultQuery?: FilterQuery<V>
  onQueryChange?: (query: FilterQuery<V>, details: FilterChangeDetails<V, O>) => void

  labels?: Partial<FilterLabels>
  /** Extra or replacement value editors, resolved by a field's `editor` name. */
  editors?: FilterEditorRegistry

  /**
   * The density of the whole bar, chips included. TWO RUNGS and no `lg`,
   * resolved through `filterControlSizes` to whatever the ACTIVE STYLE calls
   * that rung (nova 7/8, sera 9/10, mira 6/7, maia and luma 8/9, lyra and rhea
   * 7/8, vega 8/9). Chips need no `ButtonGroup` variant: `items-stretch` gives
   * the pill the height of its one definite-height child, the kebab.
   */
  size?: 'sm' | 'default'
  disabled?: boolean
  readOnly?: boolean

  /**
   * ONE VETO POINT for every change the BAR makes to the query, and only those.
   * Return `false` to refuse; anything else commits, and `details.reason` names
   * the action. One hook because every write goes through `emit`, the
   * Delete key included. It can only refuse, and
   * it sits BEHIND the lock, so a locked bar never asks it. Returning a
   * REPLACEMENT tree was rejected: the announcement is already computed from
   * the proposed tree, so the bar would say one thing and commit another.
   */
  onBeforeQueryChange?: (
    query: FilterQuery<V>,
    details: FilterChangeDetails<V, O>,
  ) => boolean | void

  /**
   * Classes for the dropdown MENUS and the field PICKER panel, one prop each
   * rather than one per mount point. Merged after the default, so `w-*` wins.
   */
  menuClassName?: string
  fieldPickerClassName?: string

  /**
   * How a NESTED attribute path is shortened when too deep to read. `"none"` is
   * the default, so an upgrade changes nothing under a consumer; the collapser
   * is the cascader's, and the full path survives as the accessible NAME.
   */
  pathCollapse?: FilterPathCollapse
  /**
   * How many names survive the collapse, the elided run not counted. Inert
   * while `pathCollapse` is `"none"`. Three is the cascader's own default.
   */
  maxPathSegments?: number

  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode

  children: React.ReactNode
}

export function Filters<V = unknown, O = unknown>({
  fields,
  query: controlledQuery,
  defaultQuery,
  onQueryChange,
  labels: labelsProp,
  editors: editorsProp,
  size = 'default',
  disabled = false,
  readOnly = false,
  onBeforeQueryChange,
  menuClassName,
  fieldPickerClassName,
  pathCollapse = 'none',
  maxPathSegments = 3,
  renderValue,
  renderChip,
  children,
}: FiltersProps<V, O>) {
  const { query, queryRef, setQuery } = useControllableQuery<V, O>(
    controlledQuery,
    defaultQuery,
    onQueryChange,
  )

  const noDraft: FilterDraft<V> | null = null
  const [draft, dispatchDraftRaw] = React.useReducer(filterDraftReducer<V>, noDraft)

  // Text AND a counter: `aria-live` fires on a DOM mutation and React writes
  // nothing when the string is already there, so a repeat was silent. Measured
  // with a MutationObserver: "Group added" three times, one mutation.
  const [announced, setAnnounced] = React.useState({ seq: 0, text: '' })
  const announcement = announced.text

  const setAnnouncement = React.useCallback((text: string) => {
    setAnnounced((prev) => ({ seq: prev.seq + 1, text }))
  }, [])

  // Seeded from useId: ids from Date.now() plus Math.random() broke hydration.
  const idSeed = React.useId()
  const nextId = React.useMemo(() => createFilterIdFactory(`${idSeed}f`), [idSeed])

  const focusStore = React.useMemo(() => createFilterFocusStore(), [])
  // One per root: the value-to-label store every `useFilterOptions` shares.
  const resolutionStore = React.useMemo(() => createFilterResolutionStore(), [])

  /* -------------------------------- derived ------------------------------- */

  // `fields` is an inline literal at every real call site, so the CHEAP walk
  // runs every render and the EXPENSIVE index memoizes on its result. Not a
  // ref caching the previous index: writing a ref during render is the
  // impurity this rewrite removed, and it misbehaves under StrictMode.
  const signature = computeFilterSchemaSignature(fields)

  const index = React.useMemo(
    () => buildFilterIndex<V, O>(fields, null, signature),
    // Not `fields`: its identity changes every render at every real call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )

  const labels = React.useMemo(() => resolveFilterLabels(labelsProp), [labelsProp])

  const editors = React.useMemo(
    () => ({ ...DEFAULT_FILTER_EDITORS, ...editorsProp }),
    [editorsProp],
  )

  const resolveOperators = resolveFilterOperators<V, O>

  const ruleCount = React.useMemo(() => countFilterRules(query), [query])

  /* --------------------------- latest-props ref --------------------------- */

  const latest = React.useRef({
    index,
    labels,
    resolveOperators,
    draft,
    nextId,
    setQuery,
    queryRef,
    disabled,
    readOnly,
    onBeforeQueryChange,
  })

  React.useEffect(() => {
    latest.current = {
      index,
      labels,
      resolveOperators,
      draft,
      nextId,
      setQuery,
      queryRef,
      disabled,
      readOnly,
      onBeforeQueryChange,
    }
  })

  /* -------------------------------- actions ------------------------------- */

  // Every mutator below reads state through `latest`, so no keystroke rebuilds
  // one. The lock flags are the ONE exception, for the reason on `locked`.

  /**
   * THE MUTATION BOUNDARY, asked here and not at the nine buttons, because the
   * routes into a query are not only buttons. It needs BOTH the closure and
   * the ref: `latest` is written in a passive effect and effects run
   * child-first, so a consumer effect in the commit that turns `readOnly` on
   * runs BEFORE the ref learns of it, while the ref is what a stale handler
   * reads afterwards.
   */
  const locked = React.useCallback(
    () => disabled || readOnly || isFilterLocked(latest.current),
    [disabled, readOnly],
  )

  // Reports whether the write LANDED: `onBeforeQueryChange` is discoverable
  // only here, and a vetoed remove that still announced a count would lie.
  const emit = React.useCallback(
    (
      next: FilterQuery<V>,
      reason: FilterChangeDetails<V, O>['reason'],
      rule: FilterRule<V> | null,
    ): boolean => {
      // The backstop, redundant with each mutator's own early return, and
      // FIRST, so the consumer hook cannot approve what the lock refused.
      if (locked()) return false
      const field = rule ? (getFilterField(latest.current.index, rule.path) ?? null) : null
      const details: FilterChangeDetails<V, O> = { reason, rule, field }

      // Strictly `false`, so a handler that forgets to return is not a veto.
      if (latest.current.onBeforeQueryChange?.(next, details) === false) {
        return false
      }

      latest.current.setQuery(next, details)

      return true
    },
    [locked],
  )

  /**
   * Drops the roving tab stop when the node holding it no longer exists: a cell
   * claims it when the store names it, and the "row one takes it" fallback
   * fires only when the store is EMPTY, so a deleted id left twenty cells at
   * `tabindex="-1"` with focus on the BODY. Keyed on the committed `query`, so
   * a consumer's Reset or saved-view load is repaired too: add a condition,
   * press Reset, and 25 cells stayed untabbable in both twins.
   */
  React.useEffect(() => {
    const { id } = focusStore.getSnapshot()

    if (!id || findFilterNode(query, id)) return
    focusStore.set({ id: null, segment: null, autoOpen: false })
  }, [query, focusStore])

  const addRule = React.useCallback(
    (rule: FilterRule<V>, parentId?: string) => {
      if (locked()) return
      const next = insertFilterNode(latest.current.queryRef.current, rule, parentId)

      if (!emit(next, 'add', rule)) return
      setAnnouncement(latest.current.labels.countAnnouncement(countFilterRules(next)))
    },
    [emit, locked, setAnnouncement],
  )

  const updateRule = React.useCallback(
    (id: string, updates: Partial<Omit<FilterRule<V>, 'id' | 'type'>>) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = updateFilterRule(current, id, updates)

      if (next === current) return
      emit(next, 'update', findFilterRule(next, id))
    },
    [emit, locked],
  )

  const removeNode = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const removed = findFilterRule(current, id)
      const next = removeFilterNode(current, id)

      if (next === current) return

      if (!emit(next, 'remove', removed)) return
      // A rule removal reports the COUNT; a group has no rule to report and
      // takes an unknown number of conditions with it, so it says so instead.
      setAnnouncement(
        removed
          ? latest.current.labels.countAnnouncement(countFilterRules(next))
          : latest.current.labels.groupAnnouncement(false),
      )
    },
    [emit, locked, setAnnouncement],
  )

  const duplicateNode = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = duplicateFilterNode(current, id, latest.current.nextId)

      if (next === current) return

      if (!emit(next, 'duplicate', findFilterRule(current, id))) return
      // The count, not "duplicated": a GROUP adds an unknown number of rows.
      setAnnouncement(latest.current.labels.countAnnouncement(countFilterRules(next)))
    },
    [emit, locked, setAnnouncement],
  )

  const negateRule = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const rule = findFilterRule(current, id)

      if (!rule) return
      const field = getFilterField(latest.current.index, rule.path)

      if (!field) return
      const operators = latest.current.resolveOperators(field)

      const flipped = negateFilterOperator(
        getFilterOperator(operators, rule.operator),
        operators,
        rule.negated,
      )

      const next = updateFilterRule(current, id, {
        operator: flipped.operator ?? rule.operator,
        negated: flipped.negated || undefined,
      })

      emit(next, 'negate', findFilterRule(next, id))
    },
    [emit, locked],
  )

  const clearQueryAction = React.useCallback(() => {
    if (locked()) return
    const current = latest.current.queryRef.current
    const next = clearFilterQuery(current)

    if (next === current) return

    if (!emit(next, 'clear', null)) return
    setAnnouncement(latest.current.labels.countAnnouncement(0))
  }, [emit, locked, setAnnouncement])

  // The live region, opened to the chrome inside the bar. The setter itself is
  // not published: it is a channel anything could write anything to.
  const announce = React.useCallback(
    (message: string) => {
      if (!message) return
      setAnnouncement(message)
    },
    [setAnnouncement],
  )

  // A draft is a MUTATION in progress, so it locks with the rest, except
  // `close`: a panel open when the bar turned read only must still dismiss.
  const dispatchDraft = React.useCallback(
    (action: FilterDraftAction<V>) => {
      if (action.type !== 'close' && locked()) return
      dispatchDraftRaw(action)
    },
    [locked],
  )

  const openCreate = React.useCallback(() => {
    if (locked()) return
    dispatchDraftRaw({ type: 'openCreate' })
  }, [locked])

  const closeDraft = React.useCallback(() => dispatchDraftRaw({ type: 'close' }), [])

  const getQuery = React.useCallback(() => latest.current.queryRef.current, [])

  /* ------------------------- draft -> query commit ------------------------ */

  // The draft becomes a rule exactly once, when the reducer says it is ready.
  // Here rather than in each click handler, which is what lets the "arity none
  // skips the value step" branch live in the pure reducer.
  React.useEffect(() => {
    if (!draft || draft.status !== 'ready') return

    if (!isFilterDraftCommittable(draft)) return

    if (draft.ruleId) {
      updateRule(draft.ruleId, {
        path: draft.path,
        operator: draft.operator ?? '',
        value: draft.value,
      })
    } else if (!locked()) {
      // Asked here too: this branch burns an id and points the focus store at
      // it, and a store naming a chip that never existed eats the tab stop.
      const id = nextId()
      addRule(
        createFilterRule<V>({
          id,
          path: draft.path,
          // Empty on purpose: the chip renders "Select condition" and opens.
          operator: '',
          value: undefined,
        }),
      )
      focusStore.set({ id, segment: 'operator', autoOpen: true })
    }

    dispatchDraftRaw({ type: 'close' })
  }, [draft, addRule, updateRule, nextId, focusStore, locked])

  /* ---------------------------- dev diagnostics --------------------------- */

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return

    const issues = findFilterSchemaIssues(fields, resolveFilterOperators)

    if (issues.duplicatePaths.length) {
      warnFilterOnce(
        `dup:${issues.duplicatePaths.join(',')}`,
        `duplicate sibling field ids are ignored after the first: ${issues.duplicatePaths.join(', ')}`,
      )
    }

    if (issues.emptyIds.length) {
      warnFilterOnce('empty-id', 'every field needs a non-empty id')
    }

    if (issues.unknownDefaultOperators.length) {
      warnFilterOnce(
        `op:${issues.unknownDefaultOperators.join(',')}`,
        `defaultOperator names an operator the field does not offer: ${issues.unknownDefaultOperators.join(', ')}`,
      )
    }
  }, [fields])

  /* ------------------------------- contexts ------------------------------- */

  const actions = React.useMemo<FilterActionsContextValue<V, O>>(
    () => ({
      index,
      labels,
      editors,
      size,
      disabled,
      readOnly,
      menuClassName,
      fieldPickerClassName,
      pathCollapse,
      maxPathSegments,
      resolveOperators,
      resolveEditor: (field, operator) =>
        // SAFETY: the editor found for this field is rendered with this field's rules, so it takes
        // the same V and O; the registry only erased them.
        resolveFilterEditor(field, operator, editors) as FilterEditor<V, O> | undefined,
      resolution: resolutionStore,
      updateRule,
      removeNode,
      duplicateNode,
      negateRule,
      clearQuery: clearQueryAction,
      openCreate,
      closeDraft,
      dispatchDraft,
      announce,
      getQuery,
    }),
    // Every input is memoized and every action `[]`-stable, so this
    // republishes on a real schema or config change, never on a keystroke.
    [
      index,
      labels,
      editors,
      size,
      disabled,
      readOnly,
      menuClassName,
      fieldPickerClassName,
      pathCollapse,
      maxPathSegments,
      resolveOperators,
      resolutionStore,
      updateRule,
      removeNode,
      duplicateNode,
      negateRule,
      clearQueryAction,
      openCreate,
      closeDraft,
      dispatchDraft,
      announce,
      getQuery,
    ],
  )

  const state = React.useMemo(
    () => ({
      query,
      draft,
      ruleCount,
      announcement,
      announcementSeq: announced.seq,
    }),
    [query, draft, ruleCount, announcement, announced.seq],
  )

  const renderContext = React.useMemo(
    () => ({ renderValue, renderChip }),
    [renderValue, renderChip],
  )

  return (
    // SAFETY: a context can't carry type parameters, so V and O are erased here and restored by
    // the hooks in filters-context.tsx, which only run under this root.
    <FilterActionsContext.Provider value={actions as FilterActionsContextValue}>
      {/* SAFETY: as above, for the query state. */}
      <FilterStateContext.Provider value={state as FilterStateContextValue}>
        {/* SAFETY: as above, for the render props. */}
        <FilterRenderContext.Provider value={renderContext as FilterRenderContextValue}>
          <FilterFocusContext.Provider value={focusStore}>{children}</FilterFocusContext.Provider>
        </FilterRenderContext.Provider>
      </FilterStateContext.Provider>
    </FilterActionsContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Exports                                  */
/* -------------------------------------------------------------------------- */

// What the app's list pages use, so they import one module.
export {
  createFilterQuery,
  flattenFilterRules,
  isFilterQueryEmpty,
} from '@/components/reui/filters/filters-query'

export { useFilterActions, useFilterState } from '@/components/reui/filters/filters-context'

export { FilterChip } from '@/components/reui/filters/filters-chip'

export { FiltersBuilder } from '@/components/reui/filters/filters-builder'
