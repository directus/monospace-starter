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
} from '@/components/filters/context'
import {
  filterDraftReducer,
  isFilterDraftCommittable,
  type FilterDraftAction,
} from '@/components/filters/draft'
import {
  DEFAULT_FILTER_EDITORS,
  resolveFilterEditor,
  type FilterEditorRegistry,
} from '@/components/filters/filter-editors'
import {
  buildFilterIndex,
  computeFilterSchemaSignature,
  createFilterIdFactory,
  findFilterSchemaIssues,
  getFilterField,
  warnFilterOnce,
} from '@/components/filters/helpers'
import {
  getFilterOperator,
  negateFilterOperator,
  resolveFilterOperators,
} from '@/components/filters/operators'
import {
  clearFilterQuery,
  countFilterRules,
  createFilterQuery,
  createFilterRule,
  duplicateFilterRule,
  findFilterRule,
  insertFilterRule,
  removeFilterRule,
  updateFilterRule,
} from '@/components/filters/query'
import type {
  FilterChangeDetails,
  FilterDraft,
  FilterEditor,
  FilterField,
  FilterQuery,
  FilterRule,
  FilterValueDisplayContext,
} from '@/components/filters/types'
import { appCopy } from '@/lib/app.copy'

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

interface FiltersProps<V = unknown, O = unknown> {
  fields: FilterField<V, O>[]

  query?: FilterQuery<V>
  defaultQuery?: FilterQuery<V>
  onQueryChange?: (query: FilterQuery<V>, details: FilterChangeDetails<V, O>) => void

  editors?: FilterEditorRegistry

  size?: 'sm' | 'default'
  disabled?: boolean
  readOnly?: boolean

  onBeforeQueryChange?: (
    query: FilterQuery<V>,
    details: FilterChangeDetails<V, O>,
  ) => boolean | void

  menuClassName?: string
  fieldPickerClassName?: string

  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode

  children: React.ReactNode
}

export function Filters<V = unknown, O = unknown>({
  fields,
  query: controlledQuery,
  defaultQuery,
  onQueryChange,
  editors: editorsProp,
  size = 'default',
  disabled = false,
  readOnly = false,
  onBeforeQueryChange,
  menuClassName,
  fieldPickerClassName,
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

  const labels = appCopy.filters

  const editors = React.useMemo(
    () => ({ ...DEFAULT_FILTER_EDITORS, ...editorsProp }),
    [editorsProp],
  )

  const resolveOperators = resolveFilterOperators<V, O>

  const ruleCount = React.useMemo(() => countFilterRules(query), [query])

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

  // Every mutator below reads state through `latest`, so no keystroke rebuilds
  // one. The lock flags are the ONE exception, for the reason on `locked`.

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

  React.useEffect(() => {
    const { id } = focusStore.getSnapshot()

    if (!id || findFilterRule(query, id)) return
    focusStore.set({ id: null, segment: null, autoOpen: false })
  }, [query, focusStore])

  const addRule = React.useCallback(
    (rule: FilterRule<V>) => {
      if (locked()) return
      const next = insertFilterRule(latest.current.queryRef.current, rule)

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
      const next = removeFilterRule(current, id)

      if (next === current) return

      if (!emit(next, 'remove', removed)) return
      setAnnouncement(latest.current.labels.countAnnouncement(countFilterRules(next)))
    },
    [emit, locked, setAnnouncement],
  )

  const duplicateNode = React.useCallback(
    (id: string) => {
      if (locked()) return
      const current = latest.current.queryRef.current
      const next = duplicateFilterRule(current, id, latest.current.nextId)

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

// What the app's list pages use, so they import one module.
export { createFilterQuery, flattenFilterRules } from '@/components/filters/query'

export { useFilterActions, useFilterState } from '@/components/filters/context'

export { FilterChip } from '@/components/filters/filter-chip'

export { FiltersBuilder } from '@/components/filters/filter-picker'
