import { CalendarIcon, Clock2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'
import type { FocusEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

export function DatePicker({
  id,
  name,
  value,
  onChange,
  onBlur,
  includeTime = false,
  autoFocus = false,
  clearable = false,
  disabled,
  placeholder,
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  includeTime?: boolean
  autoFocus?: boolean
  clearable?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const selected = parsePickerDate(value)
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => selected ?? new Date())
  const time = value.includes('T') ? value.slice(11, 16) : '09:00'
  const calendarId = `${id ?? 'date-picker'}-calendar`
  const currentYear = new Date().getFullYear()
  const selectedYear = selected?.getFullYear() ?? currentYear
  const startMonth = new Date(Math.min(currentYear - 100, selectedYear - 100), 0)
  const endMonth = new Date(Math.max(currentYear + 20, selectedYear + 20), 11)

  function changeOpen(next: boolean) {
    if (next && selected) setMonth(selected)
    setOpen(next)

    if (!next) onBlur?.()
  }

  function clear() {
    onChange('')
  }

  function selectDate(date: Date | undefined) {
    if (!date) {
      if (clearable) clear()

      if (!includeTime) changeOpen(false)

      return
    }

    const dateValue = toDateValue(date)
    onChange(includeTime ? `${dateValue}T${time}` : dateValue)
    setMonth(date)

    if (!includeTime) changeOpen(false)
  }

  function selectTime(nextTime: string) {
    const dateValue = selected ? toDateValue(selected) : toDateValue(new Date())
    onChange(`${dateValue}T${nextTime}`)
  }

  function selectNow() {
    const current = new Date()
    const hh = String(current.getHours()).padStart(2, '0')
    const mm = String(current.getMinutes()).padStart(2, '0')
    onChange(`${toDateValue(current)}T${hh}:${mm}`)
    setMonth(current)
  }

  function blurInput(event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget

    if (!(next instanceof Node && event.currentTarget.parentElement?.contains(next))) onBlur?.()
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <InputGroup className={className}>
        <InputGroupInput
          id={id}
          name={name}
          type={includeTime ? 'datetime-local' : 'date'}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid || undefined}
          aria-describedby={ariaDescribedBy}
          onChange={(event) => {
            const next = event.target.value
            onChange(next)
            const date = parsePickerDate(next)

            if (date) setMonth(date)
          }}
          onBlur={blurInput}
          className={cn(
            'appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none',
            !value && 'pointer-coarse:text-transparent',
          )}
        />
        {/* Touch browsers render an empty native date input blank (or with a stray date). */}
        {value ? null : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-2.5 hidden items-center text-base text-muted-foreground md:text-sm pointer-coarse:flex"
          >
            {placeholder ?? (includeTime ? appCopy.form.selectDateTime : appCopy.form.selectDate)}
          </span>
        )}
        <InputGroupAddon align="inline-end" className="gap-0.5">
          {clearable && selected && !disabled ? (
            <InputGroupButton size="icon-xs" aria-label={appCopy.form.clearDate} onClick={clear}>
              <XIcon />
            </InputGroupButton>
          ) : null}
          <PopoverTrigger
            render={
              <InputGroupButton
                size="icon-xs"
                aria-label={appCopy.form.openCalendar}
                aria-controls={calendarId}
                disabled={disabled}
                // Touch devices get the native picker from the input itself.
                className="pointer-coarse:hidden"
              >
                <CalendarIcon />
              </InputGroupButton>
            }
          />
        </InputGroupAddon>
      </InputGroup>
      <PopoverContent id={calendarId} align="end" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={selectDate}
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          reverseYears
          autoFocus
        />
        {includeTime ? (
          <div className="border-t p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <FieldLabel htmlFor={`${id ?? 'date-picker'}-time`}>Time</FieldLabel>
              <Button type="button" variant="ghost" size="xs" onClick={selectNow}>
                Now
              </Button>
            </div>
            <InputGroup>
              <InputGroupInput
                id={`${id ?? 'date-picker'}-time`}
                type="time"
                step="60"
                value={time}
                onChange={(event) => selectTime(event.target.value)}
                className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
              <InputGroupAddon>
                <Clock2Icon className="text-muted-foreground" />
              </InputGroupAddon>
            </InputGroup>
          </div>
        ) : null}
        {clearable && selected ? (
          <div className="flex justify-end border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                clear()
                changeOpen(false)
              }}
            >
              {appCopy.inline.clear}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function parsePickerDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value)

  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? 0)
  const minute = Number(match[5] ?? 0)
  const date = new Date(year, month - 1, day, hour, minute)

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute
    ? date
    : undefined
}

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
