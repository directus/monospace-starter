import { Loader2, Pencil, Plus } from 'lucide-react'
import { createContext, use, useId, useState } from 'react'
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react'
import type { ZodType } from 'zod'

import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { optionalAmount } from '@/components/form/validators'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

// Inline editing for detail pages. Every control saves on its own (blur, Enter, or pick), closes
// at once showing the new value, and if the write fails goes back to the saved value with the
// failure under it instead of a form-level banner. Text editors take the same
// zod validators as the drawer forms; an invalid draft stays open with its message until it is
// fixed or cancelled with Escape.
//
// Display and edit states share one height (h-8) and one horizontal inset, so switching between
// them never moves anything on the page. Touch screens get a taller row to hit.

const ROW = 'h-8 pointer-coarse:h-10'

// Pull the control out by the input's own padding so text sits flush with the label at rest.
const INSET = '-mx-2.5 w-[calc(100%+1.25rem)]'

// For page-header titles: let a long name wrap to two lines on a phone instead of truncating.
export const HEADING_WRAP =
  'h-auto min-h-8 pointer-coarse:h-auto pointer-coarse:min-h-10 max-sm:[&>span]:line-clamp-2 max-sm:[&>span]:whitespace-normal'

export function PropertyList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('space-y-4', className)}>{children}</dl>
}

// Set by `Property` when the signed-in user can't change the field: its inline editor shows the
// value as plain text. Only a hint; Monospace refuses the write either way.
export const InlineReadOnly = createContext(false)

export function Property({
  label,
  readOnly = false,
  children,
}: {
  label: string
  readOnly?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-1 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        <InlineReadOnly value={readOnly}>{children}</InlineReadOnly>
      </dd>
    </div>
  )
}

function ReadOnlyValue({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center px-2.5',
        ROW,
        INSET,
        !children && 'text-muted-foreground',
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children ?? appCopy.fallback.none}</span>
    </div>
  )
}

// `pending` holds the value being written, so the closed editor shows it right away. The caller's
// value takes over once the write settles: the new one on success, the old one on failure.
function useInlineSave<T>(onSave: (value: T) => Promise<void>) {
  const [pending, setPending] = useState<{ value: T }>()
  const [error, setError] = useState<string>()

  async function save(value: T) {
    setPending({ value })
    setError(undefined)

    try {
      await onSave(value)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(undefined)
    }
  }

  return {
    saving: pending !== undefined,
    pending,
    error,
    save,
    setError,
    clearError: () => setError(undefined),
  }
}

function invalidMessage(schema: ZodType | undefined, value: string) {
  if (!schema) return undefined
  const result = schema.safeParse(value)

  return result.success ? undefined : result.error.issues[0]?.message
}

function InlineError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null
}

// Blur handler that only fires when focus leaves the whole editor, not when moving between its parts.
function leaves(event: FocusEvent<HTMLElement>) {
  const next = event.relatedTarget

  if (next instanceof Node && event.currentTarget.contains(next)) return false

  return !(next instanceof Element && next.closest('[data-slot="select-content"]'))
}

// The resting state: looks like text, reveals a pencil on hover, or reads as an "Add …" prompt when empty.
export function InlineDisplay({
  empty,
  emptyLabel,
  onClick,
  saving,
  children,
  className,
}: {
  empty: boolean
  emptyLabel: string
  onClick: () => void
  saving?: boolean
  children?: ReactNode
  className?: string
}) {
  const readOnly = use(InlineReadOnly)

  if (readOnly)
    return <ReadOnlyValue className={className}>{empty ? undefined : children}</ReadOnlyValue>

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        'group/inline flex items-center gap-2 rounded-md px-2.5 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        ROW,
        INSET,
        empty && 'text-muted-foreground',
        className,
      )}
    >
      {empty ? (
        <>
          <Plus className="size-3.5 shrink-0" />
          <span>{emptyLabel}</span>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate">{children}</span>
      )}
      {saving ? (
        // Fades in late: a quick save never shows a spinner.
        <span className="shrink-0 animate-[reveal_150ms_ease-out_400ms_forwards] opacity-0">
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        </span>
      ) : !empty ? (
        <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100 [@media(hover:hover)]:opacity-0" />
      ) : null}
    </button>
  )
}

function editorKeys(commit: () => void, cancel: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault()
      commit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }
}

export function InlineText({
  label,
  value,
  type = 'text',
  emptyLabel,
  format,
  action,
  validate,
  onSave,
  className,
  displayClassName,
  inputClassName,
}: {
  label: string
  value: string | null | undefined
  type?: 'text' | 'email' | 'tel' | 'url' | 'date' | 'number'
  emptyLabel?: string
  format?: (value: string) => ReactNode
  // Touch-only button beside the value (call, email, open). On touch, links inside the value
  // go inert so a tap edits; on desktop they stay clickable and the action is hidden.
  action?: (value: string) => ReactNode
  validate?: ZodType
  onSave: (value: string | null) => Promise<void>
  className?: string
  displayClassName?: string
  inputClassName?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { saving, pending, error, save, setError, clearError } = useInlineSave(onSave)
  const id = useId()
  const shown = pending ? pending.value : value

  function start() {
    setDraft(shown ?? '')
    clearError()
    setEditing(true)
  }

  async function commit() {
    const next = draft.trim() || null

    if (next === (value ?? null)) {
      setEditing(false)

      return
    }

    const message = invalidMessage(validate, draft.trim())

    if (message) {
      setError(message)

      return
    }

    setEditing(false)
    await save(next)
  }

  const display = (
    <InlineDisplay
      empty={!shown}
      emptyLabel={emptyLabel ?? appCopy.inline.add(label)}
      onClick={start}
      saving={saving}
      className={cn(
        action && 'min-w-0 flex-1 pointer-coarse:[&_a]:pointer-events-none',
        displayClassName,
      )}
    >
      {shown ? (format ? format(shown) : shown) : null}
    </InlineDisplay>
  )

  return (
    <div className={className}>
      {editing ? (
        type === 'date' ? (
          <DatePicker
            id={id}
            value={draft}
            aria-label={label}
            onChange={(next) => {
              setDraft(next)
              const date = next || null

              if (date === (value ?? null)) {
                setEditing(false)

                return
              }

              setEditing(false)
              void save(date)
            }}
            onBlur={() => setEditing(false)}
            autoFocus
            clearable
            disabled={saving}
            className={cn(ROW, INSET, inputClassName)}
          />
        ) : (
          <Input
            id={id}
            type={type}
            value={draft}
            autoFocus
            aria-label={label}
            onChange={(event) => {
              setDraft(event.target.value)
              clearError()
            }}
            onBlur={() => void commit()}
            onKeyDown={editorKeys(
              () => void commit(),
              () => setEditing(false),
            )}
            disabled={saving}
            className={cn(ROW, INSET, inputClassName)}
          />
        )
      ) : action && shown ? (
        <div className="flex items-center gap-3">
          {display}
          <span className="hidden pointer-coarse:contents">{action(shown)}</span>
        </div>
      ) : (
        display
      )}
      <InlineError message={error} />
    </div>
  )
}

export function InlineSelect({
  label,
  value,
  options,
  render,
  onSave,
  className,
}: {
  label: string
  value: string | null | undefined
  options: ReadonlyArray<{ value: string; label: string }>
  render?: (value: string) => ReactNode
  onSave: (value: string) => Promise<void>
  className?: string
}) {
  const { saving, pending, error, save } = useInlineSave(onSave)
  const readOnly = use(InlineReadOnly)
  const current = pending ? pending.value : (value ?? null)

  if (readOnly) {
    return (
      <ReadOnlyValue className={className}>
        {current
          ? render
            ? render(current)
            : options.find((option) => option.value === current)?.label
          : undefined}
      </ReadOnlyValue>
    )
  }

  return (
    <div className={className}>
      <Select
        items={options}
        value={current}
        onValueChange={(next) => {
          if (next && next !== current) void save(next)
        }}
        disabled={saving}
      >
        <SelectTrigger
          aria-label={label}
          className={cn(
            'border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent [&_svg]:opacity-40 [&:hover_svg]:opacity-100 [@media(hover:hover)]:[&_svg]:opacity-0',
            ROW,
            INSET,
          )}
        >
          <SelectValue placeholder={appCopy.inline.set(label)}>
            {render && current ? () => render(current) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {render ? render(option.value) : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <InlineError message={error} />
    </div>
  )
}

export function InlineRelation({
  label,
  value,
  search,
  emptyLabel,
  clearable = true,
  render,
  onSave,
  className,
}: {
  label: string
  value: RelationOption | null
  search: (q: string) => Promise<Array<RelationOption>>
  emptyLabel?: string
  clearable?: boolean
  render?: (option: RelationOption) => ReactNode
  onSave: (option: RelationOption | null) => Promise<void>
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const { saving, pending, error, save, clearError } = useInlineSave(onSave)
  const id = useId()
  const shown = pending ? pending.value : value

  return (
    <div className={className}>
      {editing ? (
        <RelationCombobox
          id={id}
          value={shown}
          onChange={(next) => {
            if (next?.value === value?.value) {
              setEditing(false)

              return
            }

            setEditing(false)
            void save(next)
          }}
          onBlur={() => setEditing(false)}
          search={search}
          placeholder={appCopy.inline.set(label)}
          clearable={clearable}
          disabled={saving}
          defaultOpen
          className={cn(
            INSET,
            '[&>button]:h-8 [&>button]:pl-[calc(0.625rem-1px)] pointer-coarse:[&>button]:h-10',
          )}
        />
      ) : (
        <InlineDisplay
          empty={!shown}
          emptyLabel={emptyLabel ?? appCopy.inline.set(label)}
          onClick={() => {
            clearError()
            setEditing(true)
          }}
          saving={saving}
        >
          {shown ? (render ? render(shown) : shown.label) : null}
        </InlineDisplay>
      )}
      <InlineError message={error} />
    </div>
  )
}

export function InlineMoney({
  label,
  amount,
  currency,
  currencies,
  format,
  onSave,
  className,
}: {
  label: string
  amount: string | null | undefined
  currency: string
  currencies: ReadonlyArray<string>
  format: (amount: string, currency: string) => ReactNode
  onSave: (value: { amount: string | null; currency: string }) => Promise<void>
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftCurrency, setDraftCurrency] = useState(currency)
  const { saving, pending, error, save, setError, clearError } = useInlineSave(onSave)
  const shown = pending ? pending.value : { amount: amount ?? null, currency }

  function start() {
    setDraftAmount(shown.amount ?? '')
    setDraftCurrency(shown.currency)
    clearError()
    setEditing(true)
  }

  async function commit(nextCurrency = draftCurrency) {
    const next = { amount: draftAmount.trim() || null, currency: nextCurrency }

    if (next.amount === (amount ?? null) && next.currency === currency) {
      setEditing(false)

      return
    }

    const message = invalidMessage(optionalAmount, draftAmount.trim())

    if (message) {
      setError(message)

      return
    }

    setEditing(false)
    await save(next)
  }

  return (
    <div className={className}>
      {editing ? (
        <div
          className={cn('flex items-center gap-1.5', INSET)}
          onBlur={(event) => {
            if (leaves(event)) void commit()
          }}
          onKeyDown={editorKeys(
            () => void commit(),
            () => setEditing(false),
          )}
        >
          <Input
            type="text"
            inputMode="decimal"
            value={draftAmount}
            autoFocus
            aria-label={label}
            placeholder="0.00"
            onChange={(event) => {
              setDraftAmount(event.target.value)
              clearError()
            }}
            disabled={saving}
            className={cn(ROW, 'min-w-0 flex-1')}
          />
          <Select
            items={currencies.map((code) => ({ value: code, label: code }))}
            value={draftCurrency}
            onValueChange={(next) => {
              if (!next) return
              setDraftCurrency(next)
              void commit(next)
            }}
            disabled={saving}
          >
            <SelectTrigger
              className={cn(ROW, 'w-20 shrink-0')}
              aria-label={appCopy.inline.currency}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <InlineDisplay
          empty={shown.amount == null}
          emptyLabel={appCopy.inline.add(label)}
          onClick={start}
          saving={saving}
        >
          {shown.amount != null ? format(shown.amount, shown.currency) : null}
        </InlineDisplay>
      )}
      <InlineError message={error} />
    </div>
  )
}

// One display for a person's name that edits first and last name together.
export function InlineName({
  firstName,
  lastName,
  labels,
  onSave,
  displayClassName,
  inputClassName,
  className,
}: {
  firstName: string | null | undefined
  lastName: string | null | undefined
  labels: { first: string; last: string; name: string }
  onSave: (value: { firstName: string; lastName: string }) => Promise<void>
  displayClassName?: string
  inputClassName?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draftFirst, setDraftFirst] = useState('')
  const [draftLast, setDraftLast] = useState('')
  const { saving, pending, error, save, setError, clearError } = useInlineSave(onSave)
  const shown = pending ? pending.value : { firstName, lastName }
  const full = [shown.firstName, shown.lastName].filter(Boolean).join(' ')

  function start() {
    setDraftFirst(shown.firstName ?? '')
    setDraftLast(shown.lastName ?? '')
    clearError()
    setEditing(true)
  }

  async function commit() {
    const next = { firstName: draftFirst.trim(), lastName: draftLast.trim() }

    if (next.firstName === firstName && next.lastName === lastName) {
      setEditing(false)

      return
    }

    const missing = !next.firstName ? labels.first : !next.lastName ? labels.last : null

    if (missing) {
      setError(appCopy.form.required(missing))

      return
    }

    setEditing(false)
    await save(next)
  }

  return (
    <div className={className}>
      {editing ? (
        <div
          className={cn('flex items-center gap-2', INSET)}
          onBlur={(event) => {
            if (leaves(event)) void commit()
          }}
          onKeyDown={editorKeys(
            () => void commit(),
            () => setEditing(false),
          )}
        >
          <Input
            value={draftFirst}
            autoFocus
            aria-label={labels.first}
            placeholder={labels.first}
            onChange={(event) => {
              setDraftFirst(event.target.value)
              clearError()
            }}
            disabled={saving}
            className={cn('min-w-0 flex-1 sm:w-56 sm:flex-none', inputClassName)}
          />
          <Input
            value={draftLast}
            aria-label={labels.last}
            placeholder={labels.last}
            onChange={(event) => {
              setDraftLast(event.target.value)
              clearError()
            }}
            disabled={saving}
            className={cn('min-w-0 flex-1 sm:w-56 sm:flex-none', inputClassName)}
          />
        </div>
      ) : (
        <InlineDisplay
          empty={!full}
          emptyLabel={appCopy.inline.add(labels.name)}
          onClick={start}
          saving={saving}
          className={displayClassName}
        >
          {full}
        </InlineDisplay>
      )}
      <InlineError message={error} />
    </div>
  )
}
