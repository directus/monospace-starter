import type { AnyFieldMeta } from '@tanstack/react-form'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { CheckboxCard } from '@/components/form/checkbox-card'
import { useFieldContext } from '@/components/form/contexts'
import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string; color?: string }

function SelectOptionLabel({ option }: { option: SelectOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {option.color ? (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: option.color }}
        />
      ) : null}
      <span className="truncate">{option.label}</span>
    </span>
  )
}

type ShellProps = {
  label: string
  optional?: boolean
  hint?: string
  className?: string
}

function fieldId(name: string) {
  return `field-${name.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

// Validators are zod schemas (issues) or functions returning `{ message }`; TanStack Form types
// the collected errors as `any`.
const fieldError = z.object({ message: z.string() })

function visibleErrors(meta: AnyFieldMeta) {
  if (!meta.isTouched) return []

  return meta.errors.flatMap((error) => {
    const parsed = fieldError.safeParse(error)

    return parsed.success ? [parsed.data] : []
  })
}

function FieldShell({
  id,
  label,
  optional,
  hint,
  meta,
  className,
  children,
}: ShellProps & {
  id: string
  meta: AnyFieldMeta
  children: (state: { invalid: boolean; describedBy?: string }) => ReactNode
}) {
  const errors = visibleErrors(meta)
  const invalid = errors.length > 0

  const describedBy =
    [hint ? `${id}-hint` : null, invalid ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <Field data-invalid={invalid} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className={optional ? 'w-full justify-between gap-2' : undefined}>
        {label}
        {optional ? (
          <span className="text-[11px] font-normal tracking-wide text-muted-foreground/70">
            {appCopy.common.optional}
          </span>
        ) : null}
      </FieldLabel>
      {children({ invalid, describedBy })}
      {hint ? (
        <FieldDescription id={`${id}-hint`} className="text-xs">
          {hint}
        </FieldDescription>
      ) : null}
      {meta.isValidating ? (
        <FieldDescription className="text-xs" aria-live="polite">
          {appCopy.form.checking}
        </FieldDescription>
      ) : null}
      <FieldError id={`${id}-error`} className="text-xs" errors={errors} />
    </Field>
  )
}

export function TextField({
  label,
  optional,
  hint,
  className,
  type,
  ...inputProps
}: ShellProps & Omit<React.ComponentProps<typeof Input>, 'id' | 'name' | 'value' | 'onChange'>) {
  const field = useFieldContext<string>()
  const id = fieldId(field.name)
  const isMobile = useIsMobile()

  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      meta={field.state.meta}
      className={className}
    >
      {({ invalid, describedBy }) =>
        type === 'date' || type === 'datetime-local' ? (
          <DatePicker
            id={id}
            name={field.name}
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            includeTime={type === 'datetime-local'}
            clearable={optional}
            disabled={inputProps.disabled}
            placeholder={inputProps.placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        ) : (
          <Input
            id={id}
            name={field.name}
            type={type}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            {...inputProps}
            // Phone forms open in a sliding sheet; focusing mid-slide pops the keyboard over it.
            autoFocus={inputProps.autoFocus && !isMobile}
          />
        )
      }
    </FieldShell>
  )
}

export function TextareaField({
  label,
  optional,
  hint,
  className,
  ...textareaProps
}: ShellProps & Omit<React.ComponentProps<typeof Textarea>, 'id' | 'name' | 'value' | 'onChange'>) {
  const field = useFieldContext<string>()
  const id = fieldId(field.name)

  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      meta={field.state.meta}
      className={className}
    >
      {({ invalid, describedBy }) => (
        <Textarea
          id={id}
          name={field.name}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          onBlur={field.handleBlur}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...textareaProps}
        />
      )}
    </FieldShell>
  )
}

export function SelectField({
  label,
  optional,
  hint,
  className,
  options,
  placeholder,
  disabled,
}: ShellProps & {
  options: ReadonlyArray<SelectOption>
  placeholder?: string
  disabled?: boolean
}) {
  const field = useFieldContext<string>()
  const id = fieldId(field.name)
  const selected = options.find((option) => option.value === field.state.value)

  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      meta={field.state.meta}
      className={className}
    >
      {({ invalid, describedBy }) => (
        <Select
          name={field.name}
          items={options}
          value={field.state.value}
          onValueChange={(value) => field.handleChange(value ?? '')}
          disabled={disabled}
        >
          <SelectTrigger
            id={id}
            className="w-full"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onBlur={field.handleBlur}
          >
            <SelectValue placeholder={placeholder}>
              {selected ? <SelectOptionLabel option={selected} /> : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <SelectOptionLabel option={option} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldShell>
  )
}

export function CheckboxField({
  label,
  hint,
  className,
  disabled,
}: Omit<ShellProps, 'optional'> & { disabled?: boolean }) {
  const field = useFieldContext<boolean>()
  const id = fieldId(field.name)

  return (
    <CheckboxCard
      id={id}
      name={field.name}
      checked={field.state.value}
      onCheckedChange={field.handleChange}
      onBlur={field.handleBlur}
      disabled={disabled}
      label={label}
      description={hint}
      className={className}
    />
  )
}

export function RelationField({
  label,
  optional,
  hint,
  className,
  search,
  searchKey,
  placeholder,
  searchPlaceholder,
  disabled,
  autoFocus,
}: ShellProps & {
  search: (q: string) => Promise<Array<RelationOption>>
  searchKey?: string | null
  placeholder: string
  searchPlaceholder?: string
  disabled?: boolean
  autoFocus?: boolean
}) {
  const field = useFieldContext<RelationOption | null>()
  const id = fieldId(field.name)
  const isMobile = useIsMobile()

  return (
    <FieldShell
      id={id}
      label={label}
      optional={optional}
      hint={hint}
      meta={field.state.meta}
      className={className}
    >
      {({ invalid, describedBy }) => (
        <RelationCombobox
          id={id}
          value={field.state.value}
          onChange={(option) => field.handleChange(option)}
          onBlur={field.handleBlur}
          search={search}
          searchKey={searchKey}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          disabled={disabled}
          autoFocus={autoFocus && !isMobile}
          invalid={invalid}
          clearable={optional}
          describedBy={describedBy}
        />
      )}
    </FieldShell>
  )
}
