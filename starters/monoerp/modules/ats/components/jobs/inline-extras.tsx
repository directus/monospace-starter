// Inline editors the shared set doesn't have: multi-line text, and the job's locations.
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { use, useState } from 'react'

import { InlineDisplay, InlineReadOnly } from '@/components/inline/inline-field'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { joinLocations, splitLocations } from '@/modules/ats/data/jobs'
import { hiringLocationsQuery } from '@/modules/ats/data/shared'

function InlineError({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null
}

// Saves on blur or ⌘/Ctrl+Enter; Escape cancels.
export function InlineLongText({
  label,
  value,
  onSave,
}: {
  label: string
  value: string | null | undefined
  onSave: (value: string | null) => Promise<void>
}) {
  const readOnly = use(InlineReadOnly)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  async function commit() {
    const next = draft.trim() || null

    if (next === (value ?? null)) return setEditing(false)
    setSaving(true)
    setError(undefined)

    try {
      await onSave(next)
      setEditing(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  if (editing && !readOnly) {
    return (
      <div>
        <Textarea
          aria-label={label}
          autoFocus
          value={draft}
          disabled={saving}
          rows={4}
          className="-mx-2.5 w-[calc(100%+1.25rem)]"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }

            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void commit()
            }
          }}
        />
        <InlineError message={error} />
      </div>
    )
  }

  if (value && (readOnly || !editing)) {
    return (
      <div>
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={() => {
            setDraft(value)
            setError(undefined)
            setEditing(true)
          }}
          className="-mx-2.5 block w-[calc(100%+1.25rem)] rounded-md px-2.5 py-1.5 text-left text-sm whitespace-pre-wrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:hover:bg-muted"
        >
          {value}
        </button>
        <InlineError message={error} />
      </div>
    )
  }

  return (
    <InlineDisplay
      empty
      emptyLabel={appCopy.inline.add(label)}
      onClick={() => {
        setDraft('')
        setEditing(true)
      }}
    />
  )
}

// Picks from the hiring locations in settings, keeping any stored value that isn't one of them.
export function InlineLocations({
  label,
  value,
  onSave,
}: {
  label: string
  value: string | null | undefined
  onSave: (value: string | null) => Promise<void>
}) {
  const readOnly = use(InlineReadOnly)
  const locations = useQuery(hiringLocationsQuery())
  const selected = splitLocations(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const names = [
    ...(locations.data ?? []).map((row) => row.name ?? ''),
    ...selected.filter((name) => !locations.data?.some((row) => row.name === name)),
  ].filter(Boolean)

  const chips = selected.length ? (
    <span className="flex flex-wrap gap-1">
      {selected.map((name) => (
        <Badge key={name} variant="secondary" className="font-normal">
          {name}
        </Badge>
      ))}
    </span>
  ) : null

  if (readOnly) {
    return chips ?? <span className="text-muted-foreground">{appCopy.fallback.none}</span>
  }

  async function toggle(name: string, on: boolean) {
    const next = on
      ? names.filter((item) => item === name || selected.includes(item))
      : selected.filter((item) => item !== name)

    setSaving(true)
    setError(undefined)

    try {
      await onSave(joinLocations(next))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={label}
              className={cn(
                '-mx-2.5 flex min-h-8 w-[calc(100%+1.25rem)] items-center gap-2 rounded-md px-2.5 py-1 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-10',
                !selected.length && 'text-muted-foreground',
              )}
            />
          }
        >
          <span className="min-w-0 flex-1">{chips ?? appCopy.inline.set(label)}</span>
          {saving ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {names.map((name) => (
            <DropdownMenuCheckboxItem
              key={name}
              checked={selected.includes(name)}
              closeOnClick={false}
              onCheckedChange={(on) => void toggle(name, on)}
            >
              {name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <InlineError message={error} />
    </div>
  )
}
