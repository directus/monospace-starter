import { CalendarDays, Check, Clock2, Loader2, Plus } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'

import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { atNine, fromDateTimeInput, laterToday, nextWeek, now, toDateTimeInput } from '@/lib/dates'
import { formatDue } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { filterRelationOptions } from '@/modules/crm/activity'
import { activityTypes } from '@/modules/crm/components/activity-form'
import type { ActivityDefaults, ActivityType } from '@/modules/crm/components/activity-form'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupOrganizations } from '@/modules/crm/data'
import { useCreateActivity } from '@/modules/crm/mutations'

const copy = crmCopy.activity.upcoming

export function DueChip({
  value,
  overdue,
  pending,
  onChange,
  variant = 'chip',
}: {
  value: string | null
  overdue: boolean
  pending: boolean
  onChange: (next: string | null) => void
  // `text` is the in-row form: no border, reads as a date, underlines on hover.
  variant?: 'chip' | 'text'
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const picked = useRef(false)
  const timeId = useId()

  function handleOpenChange(next: boolean) {
    if (next) {
      picked.current = false
      setDraft(value)
      setOpen(true)

      return
    }

    setOpen(false)

    if (!picked.current && draft !== value) onChange(draft)
  }

  const pick = (next: string | null) => {
    picked.current = true
    setDraft(next)
    setOpen(false)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={pending}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 text-xs whitespace-nowrap',
              variant === 'chip'
                ? 'rounded-md border px-2 transition-colors hover:bg-muted pointer-coarse:h-10'
                : 'rounded px-1 tabular-nums hover:underline',
              overdue ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
        }
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : variant === 'chip' ? (
          <CalendarDays className="size-3.5" />
        ) : null}
        {value ? formatDue(value) : copy.noDate}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto gap-0 p-0">
        <div className="grid border-b p-1">
          <QuickDate label={copy.now} onClick={() => pick(now())} />
          <QuickDate label={copy.laterToday} onClick={() => pick(laterToday())} />
          <QuickDate label={copy.tomorrow} onClick={() => pick(atNine(1))} />
          <QuickDate label={copy.nextWeek} onClick={() => pick(nextWeek())} />
          {value ? <QuickDate label={copy.clearDate} onClick={() => pick(null)} muted /> : null}
        </div>
        <Calendar
          mode="single"
          selected={draft ? new Date(draft) : undefined}
          onSelect={(date) => {
            if (!date) {
              setDraft(null)

              return
            }

            const current = draft ? new Date(draft) : new Date(laterToday())
            date.setHours(current.getHours(), current.getMinutes(), 0, 0)
            setDraft(date.toISOString())
          }}
          autoFocus
        />
        <div className="border-t p-3">
          <FieldLabel htmlFor={timeId} className="mb-1.5">
            {copy.pickTime}
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={timeId}
              type="time"
              step="60"
              value={toDateTimeInput(draft).slice(11, 16) || '09:00'}
              onChange={(event) => {
                const local = toDateTimeInput(draft ?? laterToday())
                setDraft(fromDateTimeInput(`${local.slice(0, 10)}T${event.target.value}`))
              }}
              className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
            <InputGroupAddon>
              <Clock2 className="text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function QuickDate({
  label,
  onClick,
  muted,
}: {
  label: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
        muted && 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}

export function Composer({ defaults }: { defaults: ActivityDefaults }) {
  const access = useCollectionAccess('interactions')
  const create = useCreateActivity()
  const currentUser = useCurrentUser()
  const rootRef = useRef<HTMLDivElement>(null)
  const [subject, setSubject] = useState('')
  const [type, setType] = useState<ActivityType>('call')
  const [due, setDue] = useState<string | null>(() => laterToday())

  const [organization, setOrganization] = useState<RelationOption | null>(
    defaults.organization ?? null,
  )

  const searchOrganizations = useCallback(
    (q: string) => {
      if (!defaults.organizationOptions) return lookupOrganizations(q)

      return Promise.resolve(filterRelationOptions(defaults.organizationOptions, q))
    },
    [defaults.organizationOptions],
  )

  const canSubmit = subject.trim().length > 0 && Boolean(organization) && !create.isPending

  function submit() {
    if (!canSubmit || !organization) return
    create.mutate(
      {
        type,
        status: 'open',
        direction: 'internal',
        subject: subject.trim(),
        body: null,
        occurredAt: due ?? new Date().toISOString(),
        dueAt: due,
        completedAt: null,
        organizations: { _connect: { key: { id: organization.value } } },
        contacts: defaults.contact
          ? { _connect: { key: { id: defaults.contact.value } } }
          : undefined,
        opportunities: defaults.deal
          ? { _connect: { key: { id: defaults.deal.value } } }
          : undefined,
        owner: currentUser ? { _connect: { key: { id: currentUser.id } } } : undefined,
      },
      { onSuccess: () => setSubject('') },
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  function focusInput(event: MouseEvent<HTMLDivElement>) {
    const { target } = event

    if (
      target instanceof Element &&
      target.closest('button, input, [role="combobox"], [data-slot="select-trigger"]')
    ) {
      return
    }

    rootRef.current?.querySelector('input')?.focus()
  }

  if (!access.create) return null

  return (
    <div
      ref={rootRef}
      onClick={focusInput}
      className={cn(
        'flex cursor-text flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-xs transition-[border-color,box-shadow,background-color] duration-150 ease-out [&_button]:cursor-pointer',
        create.isError
          ? 'border-destructive ring-3 ring-destructive/20'
          : 'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
      )}
    >
      {/* On a phone the org picker takes its own row right under the subject; type, due and
          add share the row below it. */}
      <Plus className="size-4 shrink-0 text-muted-foreground max-sm:-order-1" />
      <Input
        value={subject}
        placeholder={copy.addPlaceholder}
        aria-label={copy.addPlaceholder}
        onChange={(event) => setSubject(event.target.value)}
        onKeyDown={onKeyDown}
        enterKeyHint="done"
        disabled={create.isPending}
        className="h-8 min-w-40 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0 disabled:bg-transparent max-sm:-order-1 dark:bg-transparent"
      />
      <Select
        items={activityTypes.map((item) => ({ value: item.value, label: item.label }))}
        value={type}
        onValueChange={(next) => {
          const picked = activityTypes.find((item) => item.value === next)

          if (picked) setType(picked.value)
        }}
      >
        <SelectTrigger
          className="h-7 w-28 text-xs pointer-coarse:h-10"
          aria-label={crmCopy.activity.form.type}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {activityTypes.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!defaults.organization ? (
        <RelationCombobox
          id="upcoming-organization"
          value={organization}
          onChange={setOrganization}
          search={searchOrganizations}
          searchKey={defaults.organizationOptions?.map((option) => option.value).join(',')}
          placeholder={crmCopy.activity.selectOrganization}
          clearable={false}
          className="w-full max-sm:-order-1 sm:w-56 [&>button]:h-7 [&>button]:text-xs pointer-coarse:[&>button]:h-10"
        />
      ) : null}
      <DueChip value={due} overdue={false} pending={false} onChange={setDue} />
      <Button
        size="sm"
        variant={canSubmit ? 'default' : 'outline'}
        disabled={!canSubmit}
        onClick={submit}
      >
        {create.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        {copy.add}
      </Button>
      {create.isError ? (
        <p className="w-full text-xs text-destructive" role="alert">
          {appCopy.form.saveFailed}
        </p>
      ) : null}
    </div>
  )
}
