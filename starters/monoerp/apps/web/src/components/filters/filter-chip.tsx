import { ArrowLeftRightIcon, CopyIcon, EllipsisVerticalIcon, Trash2Icon, XIcon } from 'lucide-react'
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
} from '@/components/filters/context'
import {
  FilterMenu,
  useFilterOptions,
  useFilterValueResolution,
} from '@/components/filters/filter-editors'
import {
  FILTER_MENU_CLASS,
  FILTER_MENU_LABEL_CLASS,
  formatFilterPath,
  getFilterField,
} from '@/components/filters/helpers'
import {
  coerceFilterValue,
  getFilterArity,
  getFilterOperator,
  operatorTakesValue,
  visibleFilterOperators,
} from '@/components/filters/operators'
import type {
  FilterEditorProps,
  FilterField,
  FilterOperator,
  FilterRule,
} from '@/components/filters/types'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

type ChipSegment = 'operator' | 'value' | 'menu'

const noopAutoFocusRef: React.RefCallback<HTMLElement> = () => {}

// What a chip can spell out on its own: a typed or picked value. Anything else (a date token)
// needs the field's own `valueText`, and shows as blank rather than "[object Object]".
const chipWord = z.union([z.string(), z.number(), z.boolean()])

function valueWord<V>(value: V): string {
  const word = chipWord.safeParse(value)

  if (!word.success) return ''

  if (word.data === true) return appCopy.filters.trueValue

  if (word.data === false) return appCopy.filters.falseValue

  return String(word.data)
}

function defaultValueDisplay<V>(
  value: V | undefined,
  operator: FilterOperator | undefined,
  resolveOption: (value: string) => { label: string } | undefined,
  labels: ReturnType<typeof useFilterActions>['labels'],
  // The field's own word for "no value yet", which a generic label cannot beat.
  fieldPlaceholder?: string,

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

interface FilterRuleDisplay {
  pathText: string
  pathLabel: React.ReactNode

  operatorLabel: string
  valueLabel: React.ReactNode

  valueText: string

  valueFullText: string
  valueEmpty: boolean
}

function useFilterRuleDisplay<V, O>(
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

  const pathLabel = pathText

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

  open: boolean
  onClose: () => void
}

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

function FilterStepHandoff({ onRelease }: { onRelease: () => void }) {
  React.useEffect(() => onRelease, [onRelease])

  return null
}

interface FilterValuePopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  operator: FilterOperator | undefined

  trigger: React.ReactElement<React.ComponentProps<'button'>>
  className?: string
}

function FilterValuePopover<V, O>({
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

interface FilterOperatorPopoverProps<V = unknown, O = unknown> {
  rule: FilterRule<V>
  field: FilterField<V, O>
  trigger: React.ReactElement
  className?: string
}

function FilterOperatorPopover<V, O>({
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

        finalFocus={() => !handoff.current}

        className={cn('w-auto min-w-40 p-0', className)}
      >
        <FilterStepHandoff onRelease={release} />
        <FilterMenu
          items={items}
          selected={rule.operator ? [rule.operator] : []}
          onSelectionChange={(values) => {
            const value = values[0]

            if (value === undefined) {
              close()

              return
            }

            const chosen = getFilterOperator(operators, value)

            const building = !rule.operator
            actions.updateRule(rule.id, {
              operator: value,

              value: coerceFilterValue(
                rule.value,
                getFilterOperator(operators, rule.operator),
                chosen,
              ),
            })

            if (building && operatorTakesValue(chosen)) {
              handoff.current = true
              setOpen(false)

              return
            }

            close()
          }}
          labels={actions.labels}
          ariaLabel={field.label}
          searchPlaceholder={actions.labels.searchOperators}

          searchable={false}

          maxHeight={320}
        />
      </PopoverContent>
    </Popover>
  )
}

function FilterRuleMenuItems({ ruleId }: { ruleId: string }) {
  const actions = useFilterActions()
  // Gate the action as well as its trigger so keyboard actions obey the lock.
  // composing their own menu gets rows that say they are unavailable.
  const locked = isFilterLocked(actions)

  return (
    <>
      <DropdownMenuItem disabled={locked} onClick={() => actions.duplicateNode(ruleId)}>
        <CopyIcon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.duplicate}</span>
      </DropdownMenuItem>
      <DropdownMenuItem disabled={locked} onClick={() => actions.negateRule(ruleId)}>
        <ArrowLeftRightIcon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.negate}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={locked}
        onClick={() => actions.removeNode(ruleId)}
      >
        <Trash2Icon aria-hidden="true" />
        <span className={FILTER_MENU_LABEL_CLASS}>{actions.labels.remove}</span>
      </DropdownMenuItem>
    </>
  )
}

interface FilterChipProps<V = unknown> {
  rule: FilterRule<V>
  index: number
}

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

  const { pathText, pathLabel, operatorLabel, valueLabel, valueText, valueFullText, valueEmpty } =
    useFilterRuleDisplay<V, O>(rule, field, operator)

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
      className={cn('')}
      onFocusCapture={() => {
        if (!focused) focusStore.set({ id: rule.id, segment: null, autoOpen: false })
      }}
      data-index={index}
    >
      <ButtonGroupText
        title={pathText}
        className="cursor-default gap-1.5 bg-background dark:bg-input/30"
      >
        {field.icon}

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

              incomplete ? 'text-foreground' : 'text-muted-foreground',
            )}
            onPointerDown={() => focusSegment('operator')}
          >
            {operatorLabel}
          </ButtonGroupText>
        }
      />

      {hasValue ? (
        <FilterValuePopover
          rule={rule}
          field={field}
          operator={operator}
          trigger={
            <ButtonGroupText
              render={<button type="button" />}

              aria-label={locked ? valueFullText : valueText}

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
