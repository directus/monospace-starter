import { useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'

import {
  formatFilterDate,
  parseFilterDate,
  resolveFilterDate,
  toFilterDateValue,
} from '@/components/filters/date'
import type { FilterDateValue } from '@/components/filters/date'
import type { FilterEditorProps, FilterOperator } from '@/components/filters/types'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { appCopy } from '@/lib/app.copy'
import { filterDateValue } from '@/lib/filters'
import type { FilterValue, ListFilterField } from '@/lib/filters'

// Relative tokens remain relative in shared URLs, so "today" still means today after a reload.

type DateValue = FilterDateValue | [FilterDateValue, FilterDateValue]

const dateValue = z.union([z.tuple([filterDateValue, filterDateValue]), filterDateValue])

const isRange = (value: DateValue | undefined): value is [FilterDateValue, FilterDateValue] =>
  Array.isArray(value)

// Seven pinned cells wide so the popover measures the grid, and a tighter week pitch so a
// two-month range still fits under the chip.
const DAY_GRID = 'p-0 [--cell-size:--spacing(7)] [&_.rdp-month]:gap-2 [&_tbody_tr]:mt-1'

function SingleDateBody({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  field,
}: FilterEditorProps<DateValue>) {
  const current = isRange(value) ? value[0] : value
  const [text, setText] = useState(() => formatFilterDate(current))
  const selected = resolveFilterDate(current) ?? undefined

  return (
    <div className="flex flex-col gap-2 p-2">
      <Input
        {...autoFocusProps}
        value={text}
        placeholder={appCopy.filters.datePlaceholder}
        aria-label={field.label}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = parseFilterDate(event.target.value)

          if (parsed) onValueChange(parsed)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(parseFilterDate(text) ?? current)
          }

          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancel()
          }
        }}
      />
      <Calendar
        mode="single"
        className={DAY_GRID}
        selected={selected}
        defaultMonth={selected}
        onSelect={(date) => {
          if (date) commit(toFilterDateValue(date))
        }}
      />
    </div>
  )
}

const RANGE_PRESETS: Array<[string, [FilterDateValue, FilterDateValue]]> = [
  [
    'Last 7 days',
    [{ relative: { unit: 'day', offset: -6 } }, { relative: { unit: 'day', offset: 0 } }],
  ],
  [
    'Last 30 days',
    [{ relative: { unit: 'day', offset: -29 } }, { relative: { unit: 'day', offset: 0 } }],
  ],
  [
    appCopy.filters.nextMonth,
    [{ relative: { unit: 'day', offset: 0 } }, { relative: { unit: 'day', offset: 29 } }],
  ],
]

function DateRangeBody({
  value,
  onValueChange,
  commit,
  cancel,
  autoFocusProps,
  labels,
}: FilterEditorProps<DateValue>) {
  const tuple = isRange(value) ? value : undefined
  const from = resolveFilterDate(tuple?.[0]) ?? undefined
  const to = resolveFilterDate(tuple?.[1]) ?? undefined

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-3 gap-1.5">
        {RANGE_PRESETS.map(([label, preset], index) => (
          <Button
            key={label}
            {...(index === 0 ? autoFocusProps : {})}
            variant="outline"
            size="sm"
            onClick={() => commit(preset)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Calendar
        mode="range"
        numberOfMonths={2}
        className={DAY_GRID}
        selected={{ from, to }}
        defaultMonth={from}
        onSelect={(range) => {
          if (!range?.from) return
          onValueChange([toFilterDateValue(range.from), toFilterDateValue(range.to ?? range.from)])
        }}
      />
      <div className="-mx-2 flex items-center justify-end gap-1.5 border-t px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={cancel}>
          {labels.discard}
        </Button>
        <Button size="sm" disabled={!tuple} onClick={() => commit()}>
          {labels.apply}
        </Button>
      </div>
    </div>
  )
}

function DateEditor(props: FilterEditorProps<DateValue>) {
  return props.operator.arity === 'range' ? (
    <DateRangeBody {...props} />
  ) : (
    <SingleDateBody {...props} />
  )
}

const dateOperators: Array<FilterOperator> = [
  { value: 'is', label: appCopy.filters.operators.is, clause: '_eq', inverse: 'is_not' },
  { value: 'is_not', label: appCopy.filters.operators.is_not, clause: '_neq', inverse: 'is' },
  {
    value: 'is_before',
    label: appCopy.filters.operators.is_before,
    clause: '_lt',
    inverse: 'is_on_or_after',
  },
  {
    value: 'is_after',
    label: appCopy.filters.operators.is_after,
    clause: '_gt',
    inverse: 'is_on_or_before',
  },
  {
    value: 'is_on_or_before',
    label: appCopy.filters.operators.is_on_or_before,
    clause: '_lte',
    inverse: 'is_after',
  },
  {
    value: 'is_on_or_after',
    label: appCopy.filters.operators.is_on_or_after,
    clause: '_gte',
    inverse: 'is_before',
  },
  {
    value: 'between',
    label: appCopy.filters.operators.between,
    arity: 'range',
    clause: '_between',
    inverse: 'not_between',
  },
  {
    value: 'not_between',
    label: appCopy.filters.operators.not_between,
    arity: 'range',
    clause: '_nbetween',
    inverse: 'between',
  },
  {
    value: 'empty',
    label: appCopy.filters.operators.empty,
    arity: 'none',
    clause: '_null',
    clauseValue: true,
    inverse: 'not_empty',
  },
  {
    value: 'not_empty',
    label: appCopy.filters.operators.not_empty,
    arity: 'none',
    clause: '_null',
    clauseValue: false,
    inverse: 'empty',
  },
]

// The chip shows the phrase ("today"), and the same phrase is the accessible text.
function dateText(value: FilterValue, valueRange: (from: string, to: string) => string) {
  const typed = dateValue.safeParse(value).data

  if (isRange(typed)) return valueRange(formatFilterDate(typed[0]), formatFilterDate(typed[1]))

  return formatFilterDate(typed) || appCopy.form.selectDate
}

export function dateField({
  id,
  label,
  icon,
  path,
  defaultOperator = 'is',
}: {
  id: string
  label: string
  icon?: ReactNode
  path?: string
  defaultOperator?: string
}): ListFilterField {
  return {
    id,
    label,
    icon,
    path,
    kind: 'date',
    operators: dateOperators,
    defaultOperator,
    editor: DateEditor,
    renderValue: ({ value, labels }) => dateText(value, labels.valueRange),
    valueText: ({ value, labels }) => dateText(value, labels.valueRange),
  }
}
