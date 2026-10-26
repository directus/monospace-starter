import { Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { appCopy } from '@/lib/app.copy'
import { cn } from '@/lib/utils'

export type ListDisplay = 'table' | 'board'

const SEARCH_DEBOUNCE_MS = 300

// Search, then whatever scopes the list (filters, column options), with the display switch and
// the create action pushed to the far edge.
export function ListToolbar({
  title,
  icon: Icon,
  query,
  onQueryChange,
  selection,
  action,
  children,
}: {
  title?: string
  icon?: LucideIcon
  query: string
  onQueryChange: (value: string) => void
  selection?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const input = inputRef.current

    if (input && input.value !== query) input.value = query

    return () => clearTimeout(timeoutRef.current)
  }, [query])

  function scheduleQuery(next: string) {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onQueryChange(next), SEARCH_DEBOUNCE_MS)
  }

  function clearQuery() {
    clearTimeout(timeoutRef.current)

    if (inputRef.current) inputRef.current.value = ''
    onQueryChange('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-3 md:min-h-9 md:flex-row md:items-center">
      {selection ? (
        <div
          key="selection"
          className="flex h-9 shrink-0 animate-in items-center duration-150 fade-in-0 slide-in-from-left-2 motion-reduce:animate-none"
        >
          {selection}
        </div>
      ) : title ? (
        <ListTitle key="title" title={title} icon={Icon} className="hidden lg:flex" />
      ) : null}
      <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
        <div className="relative min-w-0 flex-1 max-md:basis-full md:w-56 md:flex-none">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            defaultValue={query}
            onChange={(event) => scheduleQuery(event.target.value)}
            placeholder={appCopy.list.searchPlaceholder}
            className="peer pr-8 pl-9 pointer-coarse:pr-10"
          />
          <button
            type="button"
            aria-label={appCopy.search.clear}
            onClick={clearQuery}
            className="absolute top-1/2 right-1.5 hidden size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground outline-none peer-not-placeholder-shown:grid hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:right-0 pointer-coarse:size-10 pointer-coarse:rounded-lg"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {children}
        {action}
      </div>
    </div>
  )
}

export function ListTitle({
  title,
  icon: Icon,
  className,
}: {
  title: string
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn('flex h-9 shrink-0 items-center gap-2', className)}>
      {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      <span className="font-semibold">{title}</span>
    </div>
  )
}
