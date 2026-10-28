import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import { z } from 'zod'

import { useFieldContext } from '@/components/form/contexts'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { hiringLocationsQuery } from '@/modules/ats/data/shared'

const copy = atsCopy.requests.locations

const fieldError = z.object({ message: z.string() })

// `locations` is free text in the schema; the app keeps it as a comma-separated list.
export function splitLocations(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function joinLocations(list: ReadonlyArray<string>) {
  return list.join(', ')
}

// Pick from the hiring locations in settings, or type any city, region, or "Remote".
export function LocationsField({
  label,
  optional,
  className,
}: {
  label: string
  optional?: boolean
  className?: string
}) {
  const field = useFieldContext<string>()
  const locations = useQuery(hiringLocationsQuery())
  const [draft, setDraft] = useState('')
  const id = useId()
  const selected = splitLocations(field.state.value)
  const has = (name: string) => selected.some((item) => item.toLowerCase() === name.toLowerCase())

  const set = (next: Array<string>) => field.handleChange(joinLocations(next))

  const add = (name: string) => {
    const value = name.trim()

    if (value && !has(value)) set([...selected, value])
    setDraft('')
  }

  const remove = (name: string) => set(selected.filter((item) => item !== name))

  const errors = field.state.meta.isTouched
    ? field.state.meta.errors.flatMap((error) => {
        const parsed = fieldError.safeParse(error)

        return parsed.success ? [parsed.data] : []
      })
    : []

  const suggestions = (locations.data ?? []).filter((location) => !has(location.name ?? ''))

  return (
    <Field data-invalid={errors.length > 0} className={cn('gap-1.5', className)}>
      <FieldLabel htmlFor={id} className={optional ? 'w-full justify-between gap-2' : undefined}>
        {label}
        {optional ? (
          <span className="text-[11px] font-normal tracking-wide text-muted-foreground/70">
            {appCopy.common.optional}
          </span>
        ) : null}
      </FieldLabel>
      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((name) => (
            <li
              key={name}
              className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/50 pr-1 pl-2.5 text-sm"
            >
              {name}
              <button
                type="button"
                className="grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => remove(name)}
              >
                <X className="size-3.5" />
                <span className="sr-only">{copy.remove(name)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={copy.placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={field.handleBlur}
          aria-invalid={errors.length > 0 || undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add(draft)
            }
          }}
        />
        <Button type="button" variant="outline" disabled={!draft.trim()} onClick={() => add(draft)}>
          {copy.add}
        </Button>
      </div>
      {suggestions.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <FieldDescription className="mr-1 text-xs">{copy.suggestions}</FieldDescription>
          {suggestions.map((location) => (
            <button
              key={location.id}
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
              onClick={() => add(location.name ?? '')}
            >
              <Plus className="size-3" />
              {location.name}
            </button>
          ))}
        </div>
      ) : null}
      <FieldError className="text-xs" errors={errors} />
    </Field>
  )
}
