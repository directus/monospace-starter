import { CheckIcon, XIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'
import { Cascader } from '@/components/filters/cascader'
import {
  FilterActionsContext,
  filterControlSizes,
  type FilterResolutionStore,
} from '@/components/filters/context'
import {
  applyFilterExclusiveSelection,
  filterFilterOptions,
  joinFilterPath,
  normalizeFilterQuery,
  warnFilterOnce,
} from '@/components/filters/helpers'
import type {
  AnyFilterEditor,
  FilterEditorProps,
  FilterEditorRegistry,
  FilterField,
  FilterIndex,
  FilterLabels,
  FilterLoadResult,
  FilterOperator,
  FilterOption,
  FilterOptionsState,
} from '@/components/filters/types'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'

// What an editor reads back from a rule: what an editor wrote, or what came back through the URL.
// Anything else shows as empty rather than "[object Object]".
const editorText = z.union([z.string(), z.number()])

const editorNumber = z.number()

const optionId = z.string()

interface OptionsInternalState<O> {
  items: FilterOption<O>[]
  loading: boolean
  error: boolean
  hasMore: boolean
  cursor?: string
}

const IDLE: OptionsInternalState<never> = {
  items: [],
  loading: false,
  error: false,
  hasMore: false,
}

const emptySubscribe = () => () => {}

const zeroVersion = () => 0

function filterFieldKey<V, O>(
  field: FilterField<V, O> | undefined,
  index: FilterIndex | undefined,
): string | null {
  if (!field) return null

  if (index) {
    for (const entry of index.all) {
      if (Object.is(entry.field, field)) {
        return joinFilterPath(entry.path)
      }
    }
  }

  return `#${field.id}`
}

export function useFilterOptions<V, O>(
  field: FilterField<V, O> | undefined,
  enabled: boolean,
  debounceMs = 250,
): FilterOptionsState<O> {
  const [query, setQueryState] = React.useState('')
  const [state, setState] = React.useState<OptionsInternalState<O>>(IDLE)

  const cache = React.useRef(new Map<string, FilterOption<O>>())
  const requestId = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  // Read directly, so this degrades outside a `Filters` root instead of throwing.
  const actionsContext = React.useContext(FilterActionsContext)
  const shared: FilterResolutionStore | null = actionsContext?.resolution ?? null
  const sharedKey = filterFieldKey(field, actionsContext?.index)

  // The compiler needs the store version to re-derive labels when another editor resolves them.
  const version = React.useSyncExternalStore(
    shared ? shared.subscribe : emptySubscribe,
    shared ? shared.getVersion : zeroVersion,
    shared ? shared.getVersion : zeroVersion,
  )

  const staticOptions = field?.options
  const loadOptions = field?.loadOptions
  const isAsync = Boolean(loadOptions)

  // Seeded in an effect, not during render, so the render stays pure.
  React.useEffect(() => {
    if (!staticOptions) return

    for (const option of staticOptions) cache.current.set(option.value, option)

    if (shared && sharedKey) shared.set(sharedKey, staticOptions)
  }, [staticOptions, shared, sharedKey])

  React.useEffect(() => {
    for (const option of state.items) cache.current.set(option.value, option)

    if (shared && sharedKey && state.items.length) {
      shared.set(sharedKey, state.items)
    }
  }, [state.items, shared, sharedKey])

  const run = React.useCallback(
    async (nextQuery: string, cursor: string | undefined, append: boolean) => {
      if (!loadOptions) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const id = ++requestId.current

      setState((previous) => ({
        ...previous,
        loading: true,
        error: false,
        items: append ? previous.items : [],
      }))

      try {
        const result = await loadOptions(nextQuery, {
          signal: controller.signal,
          cursor,
        })

        // A superseded request must not write; the id, not the abort, decides.
        if (id !== requestId.current) return

        const normalized: FilterLoadResult<O> = Array.isArray(result) ? { items: result } : result

        setState((previous) => ({
          items: append ? [...previous.items, ...normalized.items] : normalized.items,
          loading: false,
          error: false,
          hasMore: normalized.hasMore ?? Boolean(normalized.nextCursor),
          cursor: normalized.nextCursor,
        }))
      } catch (error) {
        if (id !== requestId.current) return

        if (error instanceof Error && error.name === 'AbortError') return
        setState((previous) => ({
          ...previous,
          loading: false,
          error: true,
          hasMore: false,
        }))
      }
    },
    [loadOptions],
  )

  React.useEffect(() => {
    if (!enabled || !isAsync) return
    const timer = setTimeout(() => void run(query, undefined, false), debounceMs)

    return () => clearTimeout(timer)
  }, [enabled, isAsync, query, debounceMs, run])

  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const normalizedQuery = normalizeFilterQuery(query)

  // Async results are server-filtered; re-filtering hides what the label omits.
  const items = React.useMemo(() => {
    if (isAsync) return state.items

    return filterFilterOptions(staticOptions ?? [], normalizedQuery)
  }, [isAsync, state.items, staticOptions, normalizedQuery])

  const setQuery = React.useCallback((next: string) => setQueryState(next), [])

  const loadMore = React.useCallback(() => {
    if (!state.hasMore || state.loading) return
    void run(query, state.cursor, true)
  }, [state.hasMore, state.loading, state.cursor, query, run])

  const retry = React.useCallback(() => {
    void run(query, undefined, false)
  }, [query, run])

  const resolve = React.useCallback(
    (value: string) => {
      // The ref cache cannot be the only tier: a ref write triggers no render,
      // so the chip would paint the raw value and never repaint. The shared
      // store holds other instances' pages and re-renders this one on a gain.
      const declared = staticOptions?.find((option) => option.value === value)

      if (declared) return declared
      const fromShared = shared && sharedKey ? shared.get(sharedKey, value) : undefined

      if (fromShared) {
        // SAFETY: the shared store is keyed by this field, and only this field's options (whose
        // payload is O) are written under that key.
        return fromShared as FilterOption<O>
      }

      return cache.current.get(value)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version forces re-derivation
    [staticOptions, shared, sharedKey, version],
  )

  return {
    items,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    query,
    setQuery,
    loadMore,
    retry,
    resolve,
  }
}

export function useFilterValueResolution<V, O>(
  field: FilterField<V, O> | undefined,
  values: readonly unknown[],
): void {
  const actionsContext = React.useContext(FilterActionsContext)
  const shared: FilterResolutionStore | null = actionsContext?.resolution ?? null
  const sharedKey = filterFieldKey(field, actionsContext?.index)
  const resolveValues = field?.resolveValues
  const staticOptions = field?.options
  // Keyed by CONTENT; NUL cannot occur inside a real stored value.
  const valuesKey = values.map((entry) => String(entry)).join('\u0000')

  React.useEffect(() => {
    if (!resolveValues || !shared || !sharedKey || valuesKey === '') return

    const missing = valuesKey.split('\u0000').filter((value) => {
      if (staticOptions?.some((option) => option.value === value)) return false

      return shared.get(sharedKey, value) === undefined
    })

    const wanted = shared.claim(sharedKey, missing)

    if (wanted.length === 0) return

    // No unmount guard: the store outlives the component.
    void Promise.resolve(resolveValues(wanted)).then(
      (options) => shared.set(sharedKey, options),
      () => shared.release(sharedKey, wanted),
    )
  }, [resolveValues, shared, sharedKey, valuesKey, staticOptions])
}

function EditorPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-slot="filter-editor"
      className={cn(
        'flex w-full flex-col gap-2 p-2',

        className,
      )}
    >
      {children}
    </div>
  )
}

function EditorFooter({
  onCancel,
  onCommit,
  labels,
  host,
}: Pick<FilterEditorProps, 'labels' | 'host'> & {
  onCancel: () => void
  onCommit: () => void
}) {
  const actions = React.useContext(FilterActionsContext)
  const sizes = filterControlSizes({ size: actions?.size ?? 'default' })

  // The create host advances on commit and has Back; amend must offer discard.
  if (host === 'create') return null

  return (
    <div className="flex items-center justify-end gap-1.5 pt-1">
      <Button variant="ghost" size={sizes.button} onClick={onCancel}>
        {labels.discard}
      </Button>
      <Button size={sizes.button} onClick={onCommit}>
        {labels.apply}
      </Button>
    </div>
  )
}

function EditorCommitButtons({
  onCancel,
  onCommit,
  labels,
}: Pick<FilterEditorProps, 'labels'> & {
  onCancel: () => void
  onCommit: () => void
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={labels.apply}
        onClick={onCommit}
      >
        <CheckIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={labels.discard}
        onClick={onCancel}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </>
  )
}

function useCommitKeys(commit: () => void, cancel: () => void) {
  return React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        commit()

        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        // Stop here so a surrounding dialog does not also close.
        event.stopPropagation()
        cancel()
      }
    },
    [commit, cancel],
  )
}

function FilterTextEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const onKeyDown = useCommitKeys(() => commit(), cancel)

  return (
    <EditorPanel className={cn('w-72 max-w-[calc(100vw-2rem)] min-w-0', field.className)}>
      <ButtonGroup className="w-full">
        <Input
          {...autoFocusProps}
          value={editorText.safeParse(value).data ?? ''}
          placeholder={field.placeholder ?? labels.valuePlaceholder}
          aria-label={field.label}
          // SAFETY: the text editor serves text fields, whose rule value is the typed string
          // (`FilterValue` in lib/filters.tsx).
          onChange={(event) => onValueChange(event.target.value as V)}
          onKeyDown={onKeyDown}
        />

        {host === 'create' ? null : (
          <EditorCommitButtons labels={labels} onCancel={cancel} onCommit={() => commit()} />
        )}
      </ButtonGroup>
    </EditorPanel>
  )
}

function FilterNumberEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const onKeyDown = useCommitKeys(() => commit(), cancel)

  return (
    // Deliberately not the text editor's `w-72`: number values are short by
    // construction, and a wide box around "42" is the opposite defect.
    <EditorPanel className={cn('w-56 min-w-0', field.className)}>
      <ButtonGroup className="w-full">
        <Input
          {...autoFocusProps}
          type="number"
          value={editorNumber.safeParse(value).data ?? ''}
          placeholder={field.placeholder}
          aria-label={field.label}
          onChange={(event) => {
            const raw = event.target.value

            // SAFETY: the number editor serves number fields, whose rule value is a number.
            onValueChange((raw === '' ? undefined : Number(raw)) as V)
          }}
          onKeyDown={onKeyDown}
        />
        {host === 'create' ? null : (
          <EditorCommitButtons labels={labels} onCancel={cancel} onCommit={() => commit()} />
        )}
      </ButtonGroup>
    </EditorPanel>
  )
}

function FilterRangeEditor<V, O>({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
  host,
  field,
}: FilterEditorProps<V, O>) {
  const tuple: unknown[] = Array.isArray(value) ? value : []
  const from = editorNumber.safeParse(tuple[0]).data
  const to = editorNumber.safeParse(tuple[1]).data
  const onKeyDown = useCommitKeys(() => commit(), cancel)

  const update = (index: 0 | 1, raw: string) => {
    const next = [from, to]

    next[index] = raw === '' ? undefined : Number(raw)

    // SAFETY: a range rule's value is a [from, to] pair of numbers, either end still blank.
    onValueChange(next as V)
  }

  return (
    <EditorPanel>
      <div className="flex items-center gap-1.5">
        <Input
          {...autoFocusProps}
          type="number"
          value={from ?? ''}
          aria-label={labels.rangeFrom(field.label)}
          onChange={(event) => update(0, event.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="text-xs text-muted-foreground">{labels.rangeSeparator}</span>
        <Input
          type="number"
          value={to ?? ''}
          aria-label={labels.rangeTo(field.label)}
          onChange={(event) => update(1, event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <EditorFooter host={host} labels={labels} onCancel={cancel} onCommit={() => commit()} />
    </EditorPanel>
  )
}

interface FilterListItem {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  disabled?: boolean

  exclusive?: boolean
}

interface FilterMenuProps {
  items: readonly FilterListItem[]

  selected: string[]
  multiple?: boolean

  onSelectionChange: (values: string[]) => void
  labels: FilterLabels
  ariaLabel: string
  searchPlaceholder?: string

  searchable?: boolean

  maxHeight?: number

  pinSelected?: boolean

  sortSelected?: 'none' | 'label' | 'snapshot'

  preFiltered?: boolean
  autoFocusProps?: FilterEditorProps['autoFocusProps']

  query?: string
  onQueryChange?: (query: string) => void
  state?: Pick<FilterOptionsState<unknown>, 'loading' | 'error' | 'hasMore' | 'loadMore' | 'retry'>
}

export function FilterMenu({
  items,
  selected,
  multiple = false,
  onSelectionChange,
  labels,
  ariaLabel,
  searchPlaceholder,
  searchable = true,
  maxHeight,
  pinSelected = false,
  sortSelected = 'none',
  preFiltered = false,
  autoFocusProps,
  query,
  onQueryChange,
  state,
}: FilterMenuProps) {
  const [ownQuery, setOwnQuery] = React.useState('')
  const [snapshot] = React.useState(selected)
  const pinned = new Set(pinSelected ? (sortSelected === 'snapshot' ? snapshot : selected) : [])
  const chosen = items.filter((item) => !item.exclusive && pinned.has(item.value))
  const rest = items.filter((item) => !item.exclusive && !pinned.has(item.value))
  const exclusive = items.filter((item) => item.exclusive)

  if (sortSelected === 'label') {
    for (const group of [chosen, rest, exclusive])
      group.sort((a, b) => a.label.localeCompare(b.label))
  }

  const rows = [...chosen, ...rest, ...exclusive].map((item, index) => ({
    ...item,
    divider:
      index > 0 &&
      ((index === chosen.length && !query?.trim()) || index === chosen.length + rest.length),
  }))

  return (
    <Cascader
      items={rows}
      selected={selected}
      multiple={multiple}
      label={ariaLabel}
      placeholder={searchPlaceholder ?? labels.searchOptions}
      searchable={searchable}
      maxHeight={maxHeight}
      autoFocusProps={autoFocusProps}
      query={query ?? ownQuery}
      onQueryChange={onQueryChange ?? setOwnQuery}
      preFiltered={preFiltered}
      empty={state?.error ? labels.error : state?.loading ? labels.loading : labels.empty}
      onSelect={(value) =>
        onSelectionChange(
          multiple
            ? selected.includes(value)
              ? selected.filter((entry) => entry !== value)
              : [...selected, value]
            : selected.includes(value)
              ? []
              : [value],
        )
      }
    >
      {state?.error || state?.hasMore ? (
        <div className="border-t p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={state.loading}
            onClick={state.error ? state.retry : state.loadMore}
          >
            {state.error ? labels.retry : state.loading ? labels.loadingMore : labels.loadMore}
          </Button>
        </div>
      ) : null}
    </Cascader>
  )
}

function OptionEditor<V, O>(props: FilterEditorProps<V, O> & { multiple: boolean }) {
  const { multiple, options, labels, autoFocusProps, commit, cancel, onValueChange, value, field } =
    props

  const selected = React.useMemo(() => {
    if (value === undefined || value === null) return []

    const picked: unknown[] = Array.isArray(value) ? value : [value]

    return picked.flatMap((entry) => {
      const id = optionId.safeParse(entry)

      return id.success ? [id.data] : []
    })
  }, [value])

  const announce = React.useContext(FilterActionsContext)?.announce

  return (
    <EditorPanel className={cn('w-48 min-w-0 gap-0 p-0', field.className)}>
      <FilterMenu
        items={options.items}
        selected={selected}
        multiple={multiple}
        onSelectionChange={(raw) => {
          const values = applyFilterExclusiveSelection(raw, selected, (value) =>
            Boolean(options.resolve(value)?.exclusive),
          )

          if (values !== raw && announce) {
            const before = new Set(selected)
            const arrived = values.find((entry) => !before.has(entry))
            const cleared = raw.length - values.length

            if (arrived !== undefined && cleared > 0) {
              announce(
                labels.exclusiveAnnouncement(options.resolve(arrived)?.label ?? arrived, cleared),
              )
            }
          } else if (values === raw && raw.length > 1) {
            const hasNoneRow =
              options.items.some((item) => item.exclusive) ||
              Boolean(field.options?.some((option) => option.exclusive))

            const unresolved = hasNoneRow
              ? raw.find((entry) => options.resolve(entry) === undefined)
              : undefined

            if (unresolved !== undefined) {
              warnFilterOnce(
                `exclusive-unresolved:${field.id}`,
                `field "${field.id}" has an exclusive option, but the value ` +
                  `"${unresolved}" resolves to no option, so the None rule ` +
                  `cannot tell whether it is the exclusive one and has left ` +
                  `it in place. Declare the exclusive option in the field's ` +
                  `\`options\` even when the rest of the list is async, or ` +
                  `cover stored values with \`resolveValues\`.`,
              )
            }
          }

          if (!multiple) {
            const next = values[0]

            // Base UI deselects the committed row; an empty filter is no gain.
            if (next === undefined) {
              cancel()

              return
            }

            // SAFETY: an option editor serves select fields, whose rule value is an option id, or
            // a list of them for "is any of" (`FilterValue` in lib/filters.tsx).
            const picked = next as V

            onValueChange(picked)
            commit(picked)

            return
          }

          // SAFETY: as above, a list of option ids.
          const picked = values as V

          onValueChange(picked)
          // Every toggle commits with the popover open: several picks, one gesture.
          commit(picked, { close: false })
        }}
        labels={labels}
        ariaLabel={field.label}
        searchable={field.searchable ?? true}
        // Not a composed `Search ${label}...`: hardcoded English no `labels`
        // override could reach, and lowercasing a label is locale-hostile.
        searchPlaceholder={field.placeholder}
        pinSelected={field.pinSelected ?? false}
        sortSelected={field.sortSelected}
        // `useFilterOptions` already applied the query, locally or server side.
        preFiltered
        query={options.query}
        onQueryChange={options.setQuery}
        state={options}
        autoFocusProps={autoFocusProps}
      />
    </EditorPanel>
  )
}

function FilterSelectEditor<V, O>(props: FilterEditorProps<V, O>) {
  return <OptionEditor {...props} multiple={false} />
}

function FilterMultiSelectEditor<V, O>(props: FilterEditorProps<V, O>) {
  return <OptionEditor {...props} multiple />
}

export type { AnyFilterEditor, FilterEditorRegistry } from '@/components/filters/types'

export const DEFAULT_FILTER_EDITORS: FilterEditorRegistry = {
  text: FilterTextEditor,
  number: FilterNumberEditor,
  range: FilterRangeEditor,
  select: FilterSelectEditor,
  multiselect: FilterMultiSelectEditor,
}

export function resolveFilterEditor<V, O>(
  field: FilterField<V, O>,
  operator: FilterOperator | undefined,
  editors: FilterEditorRegistry,
): AnyFilterEditor | undefined {
  if (field.editor) {
    // SAFETY: the editor is rendered with this same field, whose rule values are the editor's V;
    // the registry erases V and O, so a field's own typed editor is widened to it here.
    return field.editor as AnyFilterEditor
  }

  const arity = operator?.arity ?? 'one'

  if (arity === 'none') return undefined

  if (arity === 'range') return editors.range

  if (arity === 'many') {
    // An option-backed field gets checkboxes; anything else receives an array.
    if (field.options || field.loadOptions) return editors.multiselect
  }

  return editors[field.type ?? 'text'] ?? editors.text
}
