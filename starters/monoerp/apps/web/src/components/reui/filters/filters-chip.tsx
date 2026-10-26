import {
  ArrowLeftRightIcon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'
import {
  filterControlSizes,
  filterReadOnlyProps,
  isFilterLocked,
  useFilterActions,
  useFilterChipAutoOpen,
  useFilterChipFocused,
  useFilterFocusEmpty,
  useFilterFocusStore,
  useFilterRender,
} from '@/components/reui/filters/filters-context'
import {
  FilterMenu,
  useFilterOptions,
  useFilterValueResolution,
} from '@/components/reui/filters/filters-editors'
import {
  collapseFilterPath,
  FILTER_MENU_CLASS,
  FILTER_MENU_LABEL_CLASS,
  formatFilterPath,
  getFilterField,
  getFilterFieldChain,
} from '@/components/reui/filters/filters-lib'
import {
  coerceFilterValue,
  getFilterArity,
  getFilterOperator,
  operatorTakesValue,
  visibleFilterOperators,
} from '@/components/reui/filters/filters-operators'
import type {
  FilterEditorProps,
  FilterField,
  FilterOperator,
  FilterRule,
} from '@/components/reui/filters/filters-types'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Which part of the chip a pointer or key is aimed at. No `field`: the chip's
 *  attribute segment is display only, and only the builder re-picks one. */
type ChipSegment = 'operator' | 'value' | 'menu'

/** The ref half of `autoFocusProps`: a CALLBACK ref, the one shape an editor
 *  can spread onto any element without a cast, and a no-op here. */
const noopAutoFocusRef: React.RefCallback<HTMLElement> = () => {}

// What a chip can spell out on its own: a typed or picked value. Anything else (a date token)
// needs the field's own `valueText`, and shows as blank rather than "[object Object]".
const chipWord = z.union([z.string(), z.number(), z.boolean()])

function valueWord<V>(value: V): string {
  const word = chipWord.safeParse(value)

  if (!word.success) return ''

  if (word.data === true) return 'True'

  if (word.data === false) return 'False'

  return String(word.data)
}

function defaultValueDisplay<V>(
  value: V | undefined,
  operator: FilterOperator | undefined,
  resolveOption: (value: string) => { label: string } | undefined,
  labels: ReturnType<typeof useFilterActions>['labels'],
  // The field's own word for "no value yet", which a generic label cannot beat.
  fieldPlaceholder?: string,
  /** Whether the value is PICKED rather than typed: a select's search prompt
   *  and "enter text..." both give way to `labels.selectPlaceholder`. */
  optionBacked?: boolean,
): string {
  const emptyLabel = optionBacked
    ? labels.selectPlaceholder
    : (fieldPlaceholder ?? labels.valuePlaceholder)

  if (value === undefined || value === null || value === '') {
    return emptyLabel
  }

  if (getFilterArity(operator) === 'range' && Array.isArray(value)) {
    return labels.valueRange(valueWord(value[0]), valueWord(value[1]))
  }

  if (Array.isArray(value)) {
    const values = value.map((entry) => valueWord(entry))

    if (values.length === 0) return emptyLabel

    if (values.length === 1) return resolveOption(values[0])?.label ?? values[0]

    return labels.valueCount(values.length)
  }

  const word = valueWord(value)

  return resolveOption(word)?.label ?? word
}

/** The same display with the option's own icon in front. A status filter reads
 *  as its colour before its word, so dropping the swatch the picker showed
 *  makes the chip harder to scan than the list it came from. */
function valueWithIcon<V>(
  value: V | undefined,
  text: string,
  resolveOption: (value: string) => { icon?: React.ReactNode } | undefined,
): React.ReactNode {
  const single =
    value === undefined || value === null || Array.isArray(value)
      ? Array.isArray(value) && value.length === 1
        ? String(value[0])
        : null
      : String(value)

  const icon = single ? resolveOption(single)?.icon : null

  if (!icon) return text

  return (
    <span className="flex items-center gap-1.5">
      {icon}
      {text}
    </span>
  )
}

/** The glyph between two ancestors in a nested attribute path, a chevron
 *  because the `pathSeparator` string read as loud as the names it parts.
 *  DECORATIVE: `aria-hidden`, and the plain string is still what
 *  `formatFilterPath` joins for the chip's accessible name and `title`. */
function FilterPathSeparator() {
  return (
    <ChevronRightIcon
      aria-hidden="true"
      data-slot="filter-path-separator"
      /* The full muted token, not the `/60` the string carried: a size-3
         chevron composites to about 2.3:1 on white at 60%. ONE margin for both
         hosts, 3px a side against a 12px glyph; the chip's old 8px read as
         three names. Centred by two tokens each inert in the other host, and
         NOT `align-middle`, which resolves against the x-height and sat the
         glyph 1.27px low; 0.3635em is half Inter's cap height, 0.375rem half
         `size-3`. `inline-block` because the reset makes every `svg` a block,
         which broke the builder's inline `Repository > Stars` into three. */
      className="mx-[3px] inline-block size-3 shrink-0 self-center align-[calc(0.3635em_-_0.375rem)] text-muted-foreground"
    />
  )
}

/** The elided run of a collapsed path, with the FULL path behind it. THE
 *  TOOLTIP IS NOT THE ACCESSIBLE ROUTE: it is hover and focus, so the segment
 *  is `aria-hidden` and the whole path stays in the control's NAME. The host's
 *  own `title` is dropped while collapsed (`pathCollapsed`) or both fire. */
function FilterPathEllipsis({ full }: { full: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-hidden="true"
              data-slot="filter-path-ellipsis"
              /* A path SEGMENT with no air of its own: the chevron's margin
                 is all that parts a name from the next, and this used to STACK
                 an `mx` on it. Plain inline, no `vertical-align`: `middle` sat
                 the dots 1.7px low and inline-block grew the run to 21.17px. */
              className="shrink-0 self-center text-muted-foreground"
            >
              ...
            </span>
          }
        />
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Everything a rule needs in order to be READ, in either chrome. */
export interface FilterRuleDisplay {
  pathText: string
  pathLabel: React.ReactNode
  /** Whether `pathLabel` shows fewer names than the path has, so the cell's
   *  own `title` can step aside for the ellipsis segment's tooltip. */
  pathCollapsed: boolean
  operatorLabel: string
  valueLabel: React.ReactNode
  /** The same value as PLAIN TEXT, for an accessible name. Never scraped from
   *  the `renderValue` node: whatever text survives inside avatars and a count
   *  badge announces "plus one" for two people. Kept separate from
   *  `valueLabel`, not derived from it: a React node has no honest text to
   *  read back. A field whose values do not stringify supplies `valueText`
   *  itself, or the built-in fallback says "[object Object]" to exactly the
   *  audience the visible display is hiding it from. */
  valueText: string
  /** The same value with any collapsed COUNT spelled out. "3 selected" cannot
   *  be recovered from, which is fine while the editor opens and not once
   *  locked, so the control carries this as `title` and, locked, as its name. */
  valueFullText: string
  valueEmpty: boolean
}

/** How one rule reads, resolved once and shared by both chromes, so a consumer
 *  `renderValue`, the field's own and the built-in cannot disagree. */
export function useFilterRuleDisplay<V, O>(
  rule: FilterRule<V>,
  field: FilterField<V, O> | undefined,
  operator: FilterOperator | undefined,
): FilterRuleDisplay {
  const actions = useFilterActions<V, O>()
  const render = useFilterRender<V, O>()
  // Lazily: a label needs no options until an editor actually opens.
  const optionsState = useFilterOptions<V, O>(field, false)

  const values: unknown[] =
    rule.value === undefined || rule.value === null
      ? []
      : Array.isArray(rule.value)
        ? rule.value
        : [rule.value]

  // Saved views: values the loader has never returned are resolved through the
  // field's own `resolveValues`, so a restored chip reads "John Doe", not an id.
  useFilterValueResolution(field, values)

  const pathText = formatFilterPath(actions.index, rule.path, actions.labels.pathSeparator)

  const chain = getFilterFieldChain(actions.index, rule.path)

  // The CASCADER's collapser, from the actions context, so a deep path reads the
  // same on the chip and in the field picker.
  const segments = collapseFilterPath(chain, {
    maxSegments: actions.maxPathSegments,
    collapse: actions.pathCollapse,
  })

  const pathCollapsed = segments.some((segment) => segment.type === 'ellipsis')

  const pathLabel = chain.length
    ? segments.map((segment, index) => (
        <React.Fragment
          /* Positional, because a field id is unique among its SIBLINGS only:
             "Company > Team > Company" is a legal path and its two ids collide. */
          key={segment.type === 'field' ? `${index}:${segment.field.id}` : `${index}:ellipsis`}
        >
          {index > 0 ? <FilterPathSeparator /> : null}
          {segment.type === 'field' ? (
            <span>{segment.field.label}</span>
          ) : (
            <FilterPathEllipsis full={pathText} />
          )}
        </React.Fragment>
      ))
    : pathText

  const operatorLabel = operator
    ? rule.negated
      ? actions.labels.negated(operator.label)
      : operator.label
    : rule.operator || actions.labels.selectCondition

  const valueEmpty = values.length === 0 || chipWord.safeParse(rule.value).data === ''

  if (!field) {
    return {
      pathText,
      pathLabel,
      pathCollapsed,
      operatorLabel,
      valueLabel: '',
      valueText: '',
      valueFullText: '',
      valueEmpty,
    }
  }

  const valueContext = {
    value: rule.value,
    values,
    field,
    // For display only: a rule whose operator the field no longer offers is
    // dropped before it becomes a Monospace filter (`lib/filters.tsx`).
    operator: operator ?? { value: rule.operator, label: rule.operator, clause: '_eq' },
    // Resolved, not empty: a custom display needs the option behind each value.
    options: values.flatMap((entry) => {
      const option = optionsState.resolve(valueWord(entry))

      return option ? [option] : []
    }),
    labels: actions.labels,
  }

  // Computed even when a custom display replaces it: this is the string the
  // accessible name is built from. `field.valueText` overrides it.
  const valueText = field.valueText
    ? field.valueText(valueContext)
    : defaultValueDisplay(
        rule.value,
        operator,
        optionsState.resolve,
        actions.labels,
        field.placeholder,
        // Option-backed by the FIELD, not the operator: `is any of` is
        // multi-value on a plain text field too, and that one is typed into.
        field.type === 'select' || Boolean(field.options?.length) || Boolean(field.loadOptions),
      )

  const valueLabel = render.renderValue
    ? render.renderValue(valueContext)
    : field.renderValue
      ? field.renderValue(valueContext)
      : valueWithIcon(rule.value, valueText, optionsState.resolve)

  // The list behind the count, or the same text again. Multi-value only: a
  // RANGE also stores an array but already spells both ends out ("10 to 99").
  const valueFullText =
    field.valueText ||
    !Array.isArray(rule.value) ||
    getFilterArity(operator) === 'range' ||
    values.length < 2
      ? valueText
      : actions.labels.valueDetail(
          valueText,
          values.map((entry) => optionsState.resolve(String(entry))?.label ?? String(entry)),
        )

  return {
    pathText,
    pathLabel,
    pathCollapsed,
    operatorLabel,
    valueLabel,
    valueText,
    valueFullText,
    valueEmpty,
  }
}

interface FilterValueEditorProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  operator: FilterOperator
  /** Whether the surface holding it is showing. Gates the option service. */
  open: boolean
  onClose: () => void
}

/** The value editor - draft, option service, commit - with NO surface of its
 *  own, so surface and wiring can be replaced independently. The draft lives
 *  here, so a text filter dispatches once on commit, not once per keystroke. */
function FilterValueEditor<V, O>({
  rule,
  field,
  operator,
  open,
  onClose,
}: FilterValueEditorProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const [draft, setDraft] = React.useState<V | undefined>(rule.value)
  const [synced, setSynced] = React.useState({ open, value: rule.value })

  // Back to the rule's value whenever the editor opens or the rule changes under it. Adjusted
  // during render rather than in an effect, so the editor never paints the stale draft first.
  if (synced.open !== open || synced.value !== rule.value) {
    setSynced({ open, value: rule.value })

    if (open) setDraft(rule.value)
  }

  const options = useFilterOptions<V, O>(field, open)

  // A LOOKUP, not a definition: every result is a module-level built-in or the
  // consumer's own component, so the editor is never remounted mid-edit.
  const editor = React.useMemo(
    () => actions.resolveEditor(field, operator),
    [actions, field, operator],
  )

  if (!editor) return null

  const editorProps: FilterEditorProps<V, O> = {
    field,
    operator,
    value: draft,
    onValueChange: (next) => setDraft(next),
    host: 'amend',
    autoFocusProps: {
      ref: noopAutoFocusRef,
      autoFocus: true,
    },
    commit: (next, commitOptions) => {
      actions.updateRule(rule.id, { value: next === undefined ? draft : next })

      // A multi-select commits per toggle and asks to stay put; others dismiss.
      if (commitOptions?.close === false) return
      onClose()
    },
    cancel: onClose,
    // The same as cancel, honestly: `back` means something only to a `create`
    // host.
    back: onClose,
    options,
    labels: actions.labels,
  }

  // `createElement` rather than JSX: the component comes out of a lookup, so
  // `<Editor />` trips `react-hooks/static-components`. The fragment keeps the
  // props object, which carries a ref, from looking like a ref read in render.
  return <>{React.createElement(editor, editorProps)}</>
}

/** One step of the flow, released when the panel that owes it has LEFT THE
 *  DOM: both popovers keep portal content mounted through the exit transition,
 *  so this unmount IS that moment and nothing is timed. `onRelease` is used AS
 *  the cleanup, so an unmemoized callback fires its step early. */
function FilterStepHandoff({ onRelease }: { onRelease: () => void }) {
  React.useEffect(() => onRelease, [onRelease])

  return null
}

/** The value host: the editor in a popover anchored to the value segment, and
 *  BOTH routes end here. The operator popover used to draw the editor itself,
 *  so a handed-off panel sat a segment's width left of a second press. */
export interface FilterValuePopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  operator: FilterOperator | undefined
  /** The element that opens it, WITH its own children: a chip segment must be
   *  a direct child of its `ButtonGroup` for the pill to fuse. */
  trigger: React.ReactElement<React.ComponentProps<'button'>>
  className?: string
}

export function FilterValuePopover<V, O>({
  rule,
  field,
  operator,
  trigger,
  className,
}: FilterValuePopoverProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const focusStore = useFilterFocusStore()
  const autoOpen = useFilterChipAutoOpen(rule.id) === 'value'
  const [open, setOpen] = React.useState(false)
  const locked = isFilterLocked(actions)

  // The last step of the flow as well as the amend route; by now the condition
  // menu has UNMOUNTED (see `FilterStepHandoff`). Opened during render, then
  // CONSUMED in the effect, or Escape closes the editor and the handoff reopens
  // it in the same frame. Consumed even while locked: a handoff nobody spends
  // sits armed until some later chip spends it, and a chip that opened because a
  // DIFFERENT chip was arrowed onto is worse than one that opened nothing.
  if (autoOpen && !open && !locked) setOpen(true)

  React.useEffect(() => {
    if (autoOpen) focusStore.set({ id: rule.id, segment: 'value', autoOpen: false })
  }, [autoOpen, focusStore, rule.id])

  // Nothing to open, but the trigger still renders so the value keeps its
  // place, and it wears the bar's state: that hangs on the TRIGGER below,
  // which this path never reaches, so the segment used to look live.
  if (!operator || !actions.resolveEditor(field, operator)) {
    return React.cloneElement(trigger, {
      disabled: actions.disabled,
      ...filterReadOnlyProps(actions),
    })
  }

  return (
    // REFUSES to open while locked rather than leaving it to the trigger: an
    // `aria-disabled` control that still opens an editor is one that lied.
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && locked) return
        setOpen(next)
      }}
    >
      {/* The trigger IS the segment, never a wrapper. `ButtonGroup` fuses
          DIRECT children only (`*:data-slot:rounded-r-none`,
          `[&>[data-slot]~[data-slot]]:border-l-0`), so a nested one keeps its
          own border and the chip reads as separate badges. */}
      <PopoverTrigger
        render={trigger}
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
      />
      <PopoverContent align="start" className={cn('w-auto p-0', className)}>
        <FilterValueEditor<V, O>
          rule={rule}
          field={field}
          operator={operator}
          open={open}
          onClose={() => {
            setOpen(false)
            focusStore.set({ id: rule.id, segment: 'value', autoOpen: false })
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/* A chip's ATTRIBUTE is fixed once the chip exists: no field popover here. A
   new field invalidates the operator and the value, so "amending" threw both
   away. The builder keeps its picker, where a row reads as a form. */

/** The condition menu, and the step after it. The list is the cascader run
 *  flat: the old hand-rolled one marked the keyboard HIGHLIGHT with
 *  `aria-selected` and had no Home, End or typeahead. It HANDS OFF to the
 *  value popover once its own panel has left the DOM; advancing in place
 *  anchored the editor to the CONDITION segment and doubled up in the row. */
export interface FilterOperatorPopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  trigger: React.ReactElement
  className?: string
}

export function FilterOperatorPopover<V, O>({
  rule,
  field,
  trigger,
  className,
}: FilterOperatorPopoverProps<V, O>) {
  const actions = useFilterActions<V, O>()
  const focusStore = useFilterFocusStore()
  const autoOpen = useFilterChipAutoOpen(rule.id) === 'operator'
  const [open, setOpen] = React.useState(false)
  const locked = isFilterLocked(actions)
  /** Whether the close this panel is going through IS the step being handed
   *  on. A ref, so it survives the render that closes the popover. Every OPEN
   *  clears it, so an Escape or an outside press finds it already lowered and
   *  spends nothing; `release` leaves it standing because one twin asks again
   *  later: Radix reads it from `onCloseAutoFocus`, a macrotask after the
   *  unmount. Clearing it in `release` would break that twin only. */
  const handoff = React.useRef(false)
  const operators = actions.resolveOperators(field)

  // Memoized because the array IS the menu's identity: the cascader rebuilds
  // its index per `items` identity, so a fresh array rebuilds it per keystroke.
  const items = React.useMemo(
    () =>
      visibleFilterOperators(operators).map((entry) => ({
        value: entry.value,
        label: entry.label,
      })),
    [operators],
  )

  // Opened by the root the moment the chip is created, during render. CONSUMED
  // in the effect, or the handoff re-opens the menu on the frame Escape closes
  // it. Consumed even while locked, for the reason on the value popover's copy.
  if (autoOpen && !open && !locked) setOpen(true)

  React.useEffect(() => {
    if (!autoOpen) return
    handoff.current = false
    focusStore.set({ id: rule.id, segment: 'operator', autoOpen: false })
  }, [autoOpen, focusStore, rule.id])

  const close = () => {
    handoff.current = false
    setOpen(false)
    focusStore.set({ id: rule.id, segment: 'operator', autoOpen: false })
  }

  /** The parked step, spent on the frame this panel stops existing. Memoized
   *  on nothing that changes, and load bearing: `FilterStepHandoff` uses this
   *  AS its cleanup, so a new identity mid-flow fires the step too early. */
  const release = React.useCallback(() => {
    if (!handoff.current) return
    focusStore.set({ id: rule.id, segment: 'value', autoOpen: true })
  }, [focusStore, rule.id])

  // The chip going away takes its step with it: React destroys a deleted
  // subtree top down, so this runs before the panel's own cleanup.
  React.useEffect(
    () => () => {
      handoff.current = false
    },
    [],
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && locked) return

        /* Escape, an outside press, a second press: none is the step being
           taken, so none may spend it. RETIRED ON OPEN, not on close, and that
           is a twin difference: in Radix an item choice dismisses through here
           too, so retiring on close wiped the request before the unmount. */
        if (next) handoff.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={trigger}
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
      />
      <PopoverContent
        align="start"
        /* Base UI restores focus to the trigger as this panel closes, which
           lands on the condition segment AFTER the value editor has opened and
           focused its input, so a keyboard user is dropped back a step and
           cannot reach the value at all. Suppressed only while the handoff is
           up; a function because Base UI resolves it at close time, which is
           when the ref is accurate. Radix runs the same guard through
           `onCloseAutoFocus`. */
        finalFocus={() => !handoff.current}
        /* `w-auto` with a FLOOR: a catalog sizes to its longest label, and a
           boolean field's "is" and "is not" would read as a scrap of paper. */
        className={cn('w-auto min-w-40 p-0', className)}
      >
        {/* INSIDE the panel deliberately: only a child of the content is
            unmounted by the exit transition rather than by the close. */}
        <FilterStepHandoff onRelease={release} />
        <FilterMenu
          items={items}
          selected={rule.operator ? [rule.operator] : []}
          onSelectionChange={(values) => {
            const value = values[0]

            /* Deselecting the committed operator is a step back rather than a
               choice, so pressing the current row simply closes. */
            if (value === undefined) {
              close()

              return
            }

            const chosen = getFilterOperator(operators, value)
            /* BUILDING versus AMENDING. A rule reaches this menu with no operator
               exactly once, while it is being added, and only then is the
               value the step after this one. Re-picking the condition on a
               rule that already has one is an edit of that one cell: it
               commits and closes, and the user opens the value themselves. */
            const building = !rule.operator
            actions.updateRule(rule.id, {
              operator: value,
              /* The value moves with the operator: "is" to "is any of" would
                 leave a bare string where every reader expects an array. */
              value: coerceFilterValue(
                rule.value,
                getFilterOperator(operators, rule.operator),
                chosen,
              ),
            })

            if (building && operatorTakesValue(chosen)) {
              /* PARKED, not opened: `release` hands the row to its value
                 surface once this panel has unmounted. */
              handoff.current = true
              setOpen(false)

              return
            }

            close()
          }}
          labels={actions.labels}
          ariaLabel={field.label}
          searchPlaceholder={actions.labels.searchOperators}
          /* No visible search field: a CLOSED enum of six to ten labels, all
             on screen. Still RENDERED, visually hidden, because it owns focus
             and `aria-activedescendant`: arrows, Home, End and typeahead. */
          searchable={false}
          /* Taller than a value list on purpose: the operator set is CLOSED, so
             all of it fits and the height buys the whole catalog. A value list
             is open ended and would only push its own footer off the screen. */
          maxHeight={320}
          /* Deliberately unpinned: one selected operator in a short list, so
             lifting it would lose the catalog's declared reading order. */
        />
      </PopoverContent>
    </Popover>
  )
}

/** The per-rule actions in the chip's kebab, without the trigger. */
export function FilterRuleMenuItems({ ruleId }: { ruleId: string }) {
  const actions = useFilterActions()
  // Gated here as well as at the trigger, because this is EXPORTED: a consumer
  // composing their own menu gets rows that say they are unavailable.
  const locked = isFilterLocked(actions)

  return (
    /* Every row leads with an icon. `IconPlaceholder` because the source ships
       under five icon sets; no size class, because each style already sizes an
       unsized svg in a menu row; `aria-hidden`, the label IS the name. */
    <>
      <DropdownMenuItem disabled={locked} onClick={() => actions.duplicateNode(ruleId)}>
        <CopyIcon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.duplicate}</span>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={locked} onClick={() => actions.negateRule(ruleId)}>
        {/* Two arrows swapping: negation flips to the declared inverse. */}
        <ArrowLeftRightIcon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.negate}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={locked}
        onClick={() => actions.removeNode(ruleId)}
      >
        {/* No colour: the destructive variant already paints the row's svgs. */}
        <Trash2Icon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.remove}</span>
      </DropdownMenuItem>
    </>
  )
}

export interface FilterChipProps<V = unknown> {
  rule: FilterRule<V>
  index: number
}

/** One filter, as a chip. Memoization means something here: the actions
 *  context is stable, the focus store is subscribed to a boolean and the query
 *  shares structure, so editing one filter of forty re-renders one chip. */
function FilterChipImpl<V, O>({ rule, index }: FilterChipProps<V>) {
  const actions = useFilterActions<V, O>()
  const render = useFilterRender<V, O>()
  const focusStore = useFilterFocusStore()
  const focused = useFilterChipFocused(rule.id)
  const noFocus = useFilterFocusEmpty()
  const locked = isFilterLocked(actions)
  // THE CHIP'S HEIGHT, by way of the one button in it that has one:
  // `ButtonGroup` is `items-stretch` and no style gives a text segment a
  // height, so the kebab's rung is the pill's. The RADIUS survives because
  // every style whose `icon-sm` rounds differently re-pins it in a group.
  const sizes = filterControlSizes(actions)
  // The kebab is CONTROLLED so it can refuse to open: every row behind it
  // changes the query, so a locked bar keeps it shut.
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Exactly one chip is in the tab order at a time. Before anything has been
  // focused that is the first chip, so Tab reaches the row in one press.
  const isTabStop = focused || (noFocus && index === 0)

  const field = getFilterField(actions.index, rule.path)
  const operators = field ? actions.resolveOperators(field) : []
  const operator = getFilterOperator(operators, rule.operator)

  const {
    pathText,
    pathLabel,
    pathCollapsed,
    operatorLabel,
    valueLabel,
    valueText,
    valueFullText,
    valueEmpty,
  } = useFilterRuleDisplay<V, O>(rule, field, operator)

  if (!field) {
    // A rule pointing at a field the schema no longer has. Dropping it loses a
    // saved view's data; rendering nothing leaves an invisible condition still
    // filtering. It carries the SAME roving wiring as a real chip: `data-slot`
    // alone joined the arrow-key query with no `tabIndex` to land on.
    return (
      <ButtonGroup
        data-slot="filter-chip"
        data-unknown=""
        role="group"
        aria-label={actions.labels.filterLabel(rule.path.join(actions.labels.pathSeparator))}
        data-focused={focused || undefined}
        data-rule-id={rule.id}
        data-index={index}
        tabIndex={isTabStop ? 0 : -1}
        onFocusCapture={() => {
          if (!focused) focusStore.set({ id: rule.id, segment: null, autoOpen: false })
        }}
      >
        <ButtonGroupText className="bg-background text-muted-foreground dark:bg-input/30">
          {rule.path.join(actions.labels.pathSeparator)}
        </ButtonGroupText>
        <Button
          variant="outline"
          size={sizes.icon}
          className="bg-background dark:bg-input/30"
          aria-label={actions.labels.remove}
          /* It had no gate at all, so the one chip whose whole purpose is to be
             removed could be removed from a bar that refuses every other edit. */
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          onClick={() => actions.removeNode(rule.id)}
        >
          <XIcon />
        </Button>
      </ButtonGroup>
    )
  }

  if (render.renderChip) return <>{render.renderChip(rule)}</>

  const focusSegment = (segment: ChipSegment) =>
    focusStore.set({ id: rule.id, segment, autoOpen: false })

  // A rule with no condition yet, KEPT rather than removed (see
  // `isFilterRuleComplete`), so it has to read as unfinished. Through WORDS:
  // the dashed outline it replaces degraded to an underline under sera.
  const incomplete = !rule.operator

  // The same test the value segment renders under, so the name matches the
  // chip: `valueText` alone appended a placeholder to valueless conditions.
  const hasValue = Boolean(rule.operator) && operatorTakesValue(operator)

  // The value's spoken form in the chip's NAME: a name is not a prompt, so
  // "Description contains enter text..." becomes "no value".
  const valueName = valueEmpty && !field.valueText ? actions.labels.noValue : valueText

  return (
    <ButtonGroup
      data-slot="filter-chip"
      role="group"
      aria-label={actions.labels.filterLabel(
        `${pathText} ${operatorLabel}${hasValue ? ` ${valueName}` : ''}`.trim() +
          (incomplete ? `, ${actions.labels.incomplete}` : ''),
      )}
      data-focused={focused || undefined}
      data-incomplete={incomplete || undefined}
      data-rule-id={rule.id}
      tabIndex={isTabStop ? 0 : -1}
      className={cn(
        /* Sera is an underline style, so the boxed segments are normalised to
           its bottom-border-only look or the chip reads as a mix of both. */
        'style-sera:*:border-transparent style-sera:*:border-b-input style-sera:*:rounded-none',
      )}
      onFocusCapture={() => {
        if (!focused) focusStore.set({ id: rule.id, segment: null, autoOpen: false })
      }}
      data-index={index}
    >
      {/* DISPLAY ONLY: a div, not a button, not a tab stop, no popover. The
          attribute is fixed for the life of the chip. */}
      <ButtonGroupText
        /* Dropped while the path is collapsed: the ellipsis inside carries the
           same sentence as a tooltip, and the two would stack. */
        title={pathCollapsed ? undefined : pathText}
        className="cursor-default gap-1.5 bg-background dark:bg-input/30"
      >
        {field.icon}
        {/* Zero gap INSIDE the path, so the separator's own margin is the only
            air around a chevron; `gap-1.5` used to stack 6px a side on it. */}
        <span className="flex items-center">{pathLabel}</span>
      </ButtonGroupText>

      <FilterOperatorPopover
        rule={rule}
        field={field}
        trigger={
          <ButtonGroupText
            render={<button type="button" />}
            className={cn(
              'cursor-default bg-background hover:bg-accent dark:bg-input/30',
              /* The operator is connective tissue between the field and the
                 value, so it reads quieter than either - unless it is still
                 the prompt "Select condition", the one thing to act on. */
              incomplete ? 'text-foreground' : 'text-muted-foreground',
            )}
            onPointerDown={() => focusSegment('operator')}
          >
            {operatorLabel}
          </ButtonGroupText>
        }
      />

      {/* No condition, no value: `getFilterArity(undefined)` defaults to "one",
          so testing the operator alone renders a stray value segment. */}
      {hasValue ? (
        <FilterValuePopover
          rule={rule}
          field={field}
          operator={operator}
          trigger={
            <ButtonGroupText
              render={<button type="button" />}
              /* Named explicitly rather than by its contents: avatars or a
                 "+2" badge, and "plus two" says nothing about two people. It
                 grows to the whole list when the editor cannot be opened,
                 since locked it must carry what a press no longer reveals. */
              aria-label={locked ? valueFullText : valueText}
              /* The pointer's route to the same thing, and only when there is
                 more to say than the segment already says. */
              title={valueFullText === valueText ? undefined : valueFullText}
              className={cn(
                'cursor-default bg-background hover:bg-accent dark:bg-input/30',
                valueEmpty && 'text-muted-foreground',
              )}
              onPointerDown={() => focusSegment('value')}
            >
              {valueLabel}
            </ButtonGroupText>
          }
        />
      ) : null}

      <DropdownMenu
        open={menuOpen}
        onOpenChange={(next) => {
          if (next && locked) return
          setMenuOpen(next)
        }}
      >
        <DropdownMenuTrigger
          disabled={actions.disabled}
          {...filterReadOnlyProps(actions)}
          render={
            <Button
              variant="outline"
              size={sizes.icon}
              /* The same surface the three text segments force. Styles whose
                 outline button is transparent in dark (sera, luma, rhea) left
                 the kebab as a notch in an otherwise filled pill. */
              className="bg-background dark:bg-input/30"
              aria-label={actions.labels.chipMenu(field.label)}
              onPointerDown={() => focusSegment('menu')}
            />
          }
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={cn(FILTER_MENU_CLASS, actions.menuClassName)}>
          <FilterRuleMenuItems ruleId={rule.id} />
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}

// SAFETY: `memo` returns the same component; it only drops the type parameters V and O, so the
// original signature is kept for callers.
export const FilterChip = React.memo(FilterChipImpl) as typeof FilterChipImpl
