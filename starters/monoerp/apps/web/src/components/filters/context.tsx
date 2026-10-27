import * as React from 'react'
import type { FilterDraftAction } from '@/components/filters/draft'
import type {
  FilterDraft,
  FilterEditor,
  FilterEditorRegistry,
  FilterField,
  FilterIndex,
  FilterLabels,
  FilterOperator,
  FilterOption,
  FilterQuery,
  FilterRule,
  FilterValueDisplayContext,
} from '@/components/filters/types'

export interface FilterActionsContextValue<V = unknown, O = unknown> {
  index: FilterIndex<V, O>
  labels: FilterLabels
  editors: FilterEditorRegistry
  size: 'sm' | 'default'

  disabled: boolean

  readOnly: boolean

  menuClassName: string | undefined
  fieldPickerClassName: string | undefined

  resolveOperators: (field: FilterField<V, O>) => FilterOperator[]
  resolveEditor: (
    field: FilterField<V, O>,
    operator: FilterOperator | undefined,
  ) => FilterEditor<V, O> | undefined

  resolution: FilterResolutionStore

  updateRule: (id: string, updates: Partial<Omit<FilterRule<V>, 'id' | 'type'>>) => void

  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  negateRule: (id: string) => void
  clearQuery: () => void

  openCreate: () => void
  closeDraft: () => void
  dispatchDraft: (action: FilterDraftAction<V>) => void

  announce: (message: string) => void

  getQuery: () => FilterQuery<V>
}

export function isFilterLocked(state: { disabled: boolean; readOnly: boolean }): boolean {
  return state.disabled || state.readOnly
}

export function filterReadOnlyProps(state: { disabled: boolean; readOnly: boolean }) {
  if (state.disabled || !state.readOnly) return null

  return { 'aria-disabled': true, 'data-readonly': '' } as const
}

interface FilterControlSizes {
  button: 'sm' | 'default'

  icon: 'icon-sm' | 'icon'
}

const FILTER_CONTROL_SIZES: Record<'sm' | 'default', FilterControlSizes> = {
  sm: { button: 'sm', icon: 'icon-sm' },
  default: { button: 'default', icon: 'icon' },
}

export function filterControlSizes(state: { size: 'sm' | 'default' }): FilterControlSizes {
  return FILTER_CONTROL_SIZES[state.size] ?? FILTER_CONTROL_SIZES.default
}

const FilterActionsContext = React.createContext<FilterActionsContextValue | null>(null)

export function useFilterActions<V = unknown, O = unknown>(): FilterActionsContextValue<V, O> {
  const context = React.useContext(FilterActionsContext)

  if (!context) {
    throw new Error('useFilterActions must be used inside <Filters>')
  }

  // SAFETY: the <Filters> root above stores the actions it built for the same V and O its
  // caller uses; a context can't carry type parameters, so they're restored here.
  return context as FilterActionsContextValue<V, O>
}

export interface FilterStateContextValue<V = unknown> {
  query: FilterQuery<V>
  draft: FilterDraft<V> | null
  ruleCount: number

  announcement: string

  announcementSeq: number
}

const FilterStateContext = React.createContext<FilterStateContextValue | null>(null)

export function useFilterState<V = unknown>(): FilterStateContextValue<V> {
  const context = React.useContext(FilterStateContext)

  if (!context) {
    throw new Error('useFilterState must be used inside <Filters>')
  }

  // SAFETY: the <Filters> root above publishes its own query, typed with the caller's V.
  return context as FilterStateContextValue<V>
}

export interface FilterRenderContextValue<V = unknown, O = unknown> {
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode
}

const FilterRenderContext = React.createContext<FilterRenderContextValue>({})

export function useFilterRender<V = unknown, O = unknown>(): FilterRenderContextValue<V, O> {
  // SAFETY: the <Filters> root above publishes the render props it was given for this V and O.
  return React.useContext(FilterRenderContext) as FilterRenderContextValue<V, O>
}

interface FilterFocus {
  id: string | null

  segment: 'field' | 'operator' | 'value' | 'menu' | null

  autoOpen: boolean
}

interface FilterFocusStore {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => FilterFocus

  set: (next: FilterFocus) => void
}

const NO_FOCUS: FilterFocus = { id: null, segment: null, autoOpen: false }

export function createFilterFocusStore(): FilterFocusStore {
  let snapshot: FilterFocus = NO_FOCUS
  const listeners = new Set<() => void>()

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)

      return () => {
        listeners.delete(onStoreChange)
      }
    },
    // The SAME object until something actually changes, which is what
    // `useSyncExternalStore` requires to avoid an infinite render loop.
    getSnapshot() {
      return snapshot
    },
    set(next) {
      if (
        next.id === snapshot.id &&
        next.segment === snapshot.segment &&
        next.autoOpen === snapshot.autoOpen
      ) {
        return
      }

      snapshot = next

      for (const listener of listeners) listener()
    },
  }
}

const FALLBACK_FOCUS_STORE = createFilterFocusStore()

const FilterFocusContext = React.createContext<FilterFocusStore>(FALLBACK_FOCUS_STORE)

export function useFilterFocusStore(): FilterFocusStore {
  return React.useContext(FilterFocusContext)
}

export function useFilterChipAutoOpen(id: string): FilterFocus['segment'] | null {
  const store = React.useContext(FilterFocusContext)

  return React.useSyncExternalStore(
    store.subscribe,
    () => {
      const snapshot = store.getSnapshot()

      return snapshot.autoOpen && snapshot.id === id ? snapshot.segment : null
    },
    () => null,
  )
}

export function useFilterFocusEmpty(): boolean {
  const store = React.useContext(FilterFocusContext)

  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === null,
    () => true,
  )
}

export function useFilterChipFocused(id: string): boolean {
  const store = React.useContext(FilterFocusContext)

  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === id,
    () => false,
  )
}

export interface FilterResolutionStore {
  subscribe: (onStoreChange: () => void) => () => void
  getVersion: () => number

  get: (fieldKey: string, value: string) => FilterOption | undefined

  set: (fieldKey: string, options: readonly FilterOption[]) => void

  claim: (fieldKey: string, values: readonly string[]) => string[]

  release: (fieldKey: string, values: readonly string[]) => void
}

export function createFilterResolutionStore(): FilterResolutionStore {
  const resolved = new Map<string, Map<string, FilterOption>>()
  const claimed = new Map<string, Set<string>>()
  const listeners = new Set<() => void>()
  let version = 0

  const bucket = (fieldKey: string) => {
    let map = resolved.get(fieldKey)

    if (!map) {
      map = new Map()
      resolved.set(fieldKey, map)
    }

    return map
  }

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange)

      return () => {
        listeners.delete(onStoreChange)
      }
    },
    getVersion() {
      return version
    },
    get(fieldKey, value) {
      return resolved.get(fieldKey)?.get(value)
    },
    set(fieldKey, options) {
      const map = bucket(fieldKey)
      let landed = false

      for (const option of options) {
        if (!map.has(option.value)) landed = true
        map.set(option.value, option)
      }

      if (!landed) return
      version += 1

      for (const listener of listeners) listener()
    },
    claim(fieldKey, values) {
      let set = claimed.get(fieldKey)

      if (!set) {
        set = new Set()
        claimed.set(fieldKey, set)
      }

      const map = resolved.get(fieldKey)
      const fresh: string[] = []

      for (const value of values) {
        if (set.has(value) || map?.has(value)) continue
        set.add(value)
        fresh.push(value)
      }

      return fresh
    },
    release(fieldKey, values) {
      const set = claimed.get(fieldKey)

      if (!set) return

      for (const value of values) set.delete(value)
    },
  }
}

export { FilterActionsContext, FilterFocusContext, FilterRenderContext, FilterStateContext }
