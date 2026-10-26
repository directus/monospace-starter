import * as React from 'react'
import type { FilterDraftAction } from '@/components/reui/filters/filters-draft'
import type { FilterPathCollapse } from '@/components/reui/filters/filters-lib'
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
} from '@/components/reui/filters/filters-types'

/** Four publishing channels, not one, so a chip never re-renders at the rate
 *  of the fastest: `actions` republishes on a schema, labels or config change,
 *  `state` on every query edit and keystroke, `render` on a `renderValue` /
 *  `renderChip` identity change, `focus` on every arrow key. */

/* -------------------------------------------------------------------------- */
/*                                   Actions                                  */
/* -------------------------------------------------------------------------- */

/** Stable for the life of the component, bar a config change. Every mutator
 *  reads a latest-props ref rather than closing over the state it needs, so a
 *  keystroke rebuilds no handler and no memoized chip re-renders. The two lock
 *  flags are published rather than kept only in that ref: a refusal that lives
 *  in a ref arrives one commit late. The two resolvers are the deliberate
 *  exception: they are read DURING render, so they memoize on the values they
 *  read instead of going through the ref. Every mutator is also the MUTATION
 *  BOUNDARY - `disabled` and `readOnly` are enforced here, not at the call
 *  sites that draw the buttons, so a route added next month is refused by
 *  construction rather than by remembering. See `isFilterLocked`. */
export interface FilterActionsContextValue<V = unknown, O = unknown> {
  /** Normalized schema. Also on the state context, from the same memo. */
  index: FilterIndex<V, O>
  labels: FilterLabels
  editors: FilterEditorRegistry
  size: 'sm' | 'default'
  /** The bar is off: nothing operable, and the controls leave the tab order. */
  disabled: boolean
  /** Readable and navigable, but not changeable. See `isFilterLocked`. */
  readOnly: boolean

  /** Consumer classes for the menus and the field picker, merged AFTER the
   *  primitive's own defaults so a consumer `w-*` wins through tailwind-merge
   *  rather than on source order. On the context: four chromes mount the same
   *  menu, and a per-chrome prop is set in four places and missed in a fifth. */
  menuClassName: string | undefined
  fieldPickerClassName: string | undefined

  /** Path shortening, published so the chip and the field picker agree. */
  pathCollapse: FilterPathCollapse
  maxPathSegments: number

  /** Operators for a field, memoized on the catalog and the schema. */
  resolveOperators: (field: FilterField<V, O>) => FilterOperator[]
  resolveEditor: (
    field: FilterField<V, O>,
    operator: FilterOperator | undefined,
  ) => FilterEditor<V, O> | undefined
  /** Value-to-label store shared by every `useFilterOptions` under the root. */
  resolution: FilterResolutionStore

  updateRule: (id: string, updates: Partial<Omit<FilterRule<V>, 'id' | 'type'>>) => void
  /** Removes a rule, and prunes any group that empties. */
  removeNode: (id: string) => void
  duplicateNode: (id: string) => void
  negateRule: (id: string) => void
  clearQuery: () => void

  openCreate: () => void
  closeDraft: () => void
  dispatchDraft: (action: FilterDraftAction<V>) => void

  /** Writes the bar's live region, for a change no visible surface reports: an
   *  editor's popover is the one place something destructive happens to rows
   *  the user is not on, with focus, name and text unchanged afterwards. Not a
   *  query write, so it skips `emit` and asks the lock nothing. */
  announce: (message: string) => void

  /** For event handlers, so a handler never closes over stale state. */
  getQuery: () => FilterQuery<V>
}

/* -------------------------------------------------------------------------- */
/*                             The mutation lock                              */
/* -------------------------------------------------------------------------- */

/** `disabled` and `readOnly` are NOT two words for one state. `disabled` is
 *  the native attribute: not operable, out of the tab order. `readOnly` blocks
 *  MUTATION and preserves NAVIGATION, because a read-only bar exists so a
 *  keyboard or screen reader user can walk the chips and find out what the
 *  view is filtered by.
 *
 *  So a mutating control keeps its tab stop and wears `aria-disabled` plus
 *  `data-readonly` (`filterReadOnlyProps`), this repo's convention for
 *  "present, focusable, not operable". `aria-readonly` is never used, being
 *  disallowed on the button, group and toolbar roles, so the BAR says it in
 *  prose through `labels.readOnly`. The refusal itself is enforced once, where
 *  every query write passes through `emit` in `filters.tsx`. */
export function isFilterLocked(state: { disabled: boolean; readOnly: boolean }): boolean {
  return state.disabled || state.readOnly
}

/** What a MUTATING control wears while the bar is read only. `null` when the
 *  bar is disabled, because the native attribute already says it. A
 *  conditional spread, not explicit `undefined`s: `aria-disabled="false"` on
 *  an enabled control is noise, and `data-readonly` is a presence hook. */
export function filterReadOnlyProps(state: { disabled: boolean; readOnly: boolean }) {
  if (state.disabled || !state.readOnly) return null

  return { 'aria-disabled': true, 'data-readonly': '' } as const
}

/* -------------------------------------------------------------------------- */
/*                               The size ladder                              */
/* -------------------------------------------------------------------------- */

/** The two shadcn button sizes one filters size resolves to. Two rungs because
 *  shadcn ships a separate ladder for labelled and for icon-only buttons, and
 *  pairing them keeps a row's kebab as tall as the cell beside it. */
export interface FilterControlSizes {
  /** Labelled buttons: the row cells, both triggers, the panel footer. */
  button: 'sm' | 'default'
  /** Icon-only buttons, and also the CHIP's height: a chip is an
   *  `items-stretch` `ButtonGroup` and no style gives its text segment a
   *  height, so the segments stretch to the kebab, the one child that has one.
   *  Sizing the kebab sizes the pill. */
  icon: 'icon-sm' | 'icon'
}

/** ONE ladder, keyed off `size`, for every control the chrome renders, so a
 *  chip and its kebab never end up different heights. Nothing here is a pixel - each value is a shadcn
 *  size NAME that `Button` resolves per style, since the control-height ladder
 *  is per style (nova 7/8, sera 9/10, mira 6/7, and so on), and the glyph size
 *  rides the same name, so pinning an icon size in here would fight the style
 *  rather than match it. Two rungs only: `lg` would make the bar taller than
 *  the style's own default control height (want taller, pick a taller STYLE),
 *  and `icon-xs` is a 20-24px square in most styles, too small for a chip's
 *  own label to clear. */
const FILTER_CONTROL_SIZES: Record<'sm' | 'default', FilterControlSizes> = {
  sm: { button: 'sm', icon: 'icon-sm' },
  default: { button: 'default', icon: 'icon' },
}

/** The pair for a bar's size, off anything with a `size`, so a
 *  consumer-composed chrome uses the same ladder as the shipped one. The
 *  fallback is for JavaScript callers: a `"lg"` TypeScript would have rejected
 *  must still draw buttons rather than throw on `.button`. */
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

/* -------------------------------------------------------------------------- */
/*                                    State                                   */
/* -------------------------------------------------------------------------- */

/** Volatile by construction: typing one character into a value editor
 *  republishes it. Subscribe from the bar and the panel, never from a chip. */
export interface FilterStateContextValue<V = unknown> {
  query: FilterQuery<V>
  draft: FilterDraft<V> | null
  ruleCount: number
  /** Live region text. Empty except immediately after an announced change. */
  announcement: string
  /** How many announcements have been made, so a REPEATED one is still heard:
   *  `aria-live` reports a DOM mutation and React writes nothing when the
   *  string is unchanged, so the chrome keys the region's contents on this. A
   *  counter rather than a timestamp: it is compared for identity, never read
   *  as a value, and is stable across a rerender that a clock is not. */
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

/* -------------------------------------------------------------------------- */
/*                                   Render                                   */
/* -------------------------------------------------------------------------- */

/** Consumer render overrides, on their own channel. They must be
 *  always-current closures yet change identity on every parent render when
 *  written inline, so isolating them re-renders only what calls them. */
export interface FilterRenderContextValue<V = unknown, O = unknown> {
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode
  renderChip?: (rule: FilterRule<V>) => React.ReactNode
}

const FilterRenderContext = React.createContext<FilterRenderContextValue>({})

export function useFilterRender<V = unknown, O = unknown>(): FilterRenderContextValue<V, O> {
  // SAFETY: the <Filters> root above publishes the render props it was given for this V and O.
  return React.useContext(FilterRenderContext) as FilterRenderContextValue<V, O>
}

/* -------------------------------------------------------------------------- */
/*                                 Focus store                                */
/* -------------------------------------------------------------------------- */

/** Which chip currently owns the row's single tab stop. */
export interface FilterFocus {
  id: string | null
  /** Which cell inside that row, for restoring focus after an edit. A chip
   *  draws `field`, `operator`, `value` and `menu`. */
  segment: 'field' | 'operator' | 'value' | 'menu' | null
  /** Open that segment's popover, not merely focus it. Picking a field commits
   *  the rule straight away and the chip appears with no condition yet, so the
   *  operator menu has to open ON THE CHIP without a second click. */
  autoOpen: boolean
}

/** An external store, deliberately NOT React state. A roving tabindex
 *  republishes on every arrow key, and `setState` would re-render the whole
 *  bar to move one outline. The SELECTOR hooks below each narrow to one value,
 *  so arrowing across forty chips re-renders two components. */
export interface FilterFocusStore {
  subscribe: (onStoreChange: () => void) => () => void
  getSnapshot: () => FilterFocus
  /** No-ops when nothing changed. */
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

/** A shared, permanently empty store, so the hook degrades to "nothing
 *  focused" outside a `Filters`. Nothing ever writes to it: each root creates
 *  and writes its own. */
const FALLBACK_FOCUS_STORE = createFilterFocusStore()

const FilterFocusContext = React.createContext<FilterFocusStore>(FALLBACK_FOCUS_STORE)

/** The store itself, for event handlers that write without subscribing. */
export function useFilterFocusStore(): FilterFocusStore {
  return React.useContext(FilterFocusContext)
}

/** The segment of THIS chip that should open itself, or null. */
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

/** Whether the row holds no focus, so the first chip keeps the tab stop. */
export function useFilterFocusEmpty(): boolean {
  const store = React.useContext(FilterFocusContext)

  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === null,
    () => true,
  )
}

/** Whether THIS chip owns the row's tab stop. */
export function useFilterChipFocused(id: string): boolean {
  const store = React.useContext(FilterFocusContext)

  return React.useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().id === id,
    () => false,
  )
}

/* -------------------------------------------------------------------------- */
/*                              Resolution store                              */
/* -------------------------------------------------------------------------- */

/** The instance-wide value-to-label store. `useFilterOptions` caches per HOOK
 *  INSTANCE, and a chip's display and its editor are two instances, so a
 *  `loadOptions`-only field rendered its raw id the moment the menu closed.
 *  Every instance under one root writes here, and `resolveValues` results land
 *  here too. External rather than React state because labels arrive from
 *  effects and promises at their own pace, and the version bumps only when a
 *  NEW label lands, so a subscriber re-renders once per page of results. */
export interface FilterResolutionStore {
  subscribe: (onStoreChange: () => void) => () => void
  getVersion: () => number
  /** The option behind a stored value, or undefined while unresolved. */
  get: (fieldKey: string, value: string) => FilterOption | undefined
  /** Records options under a field key. New values bump the version. */
  set: (fieldKey: string, options: readonly FilterOption[]) => void
  /** Marks values as resolving and returns the subset nobody has claimed yet,
   *  so two chips holding the same id issue ONE request. Claims are permanent
   *  for values a fulfilled resolve did not return, which stops an id the
   *  server does not know from being re-asked forever. */
  claim: (fieldKey: string, values: readonly string[]) => string[]
  /** Releases claims after a FAILED resolve, so a later mount may retry. */
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
