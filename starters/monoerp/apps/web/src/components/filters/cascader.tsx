import { Check, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefCallback } from 'react'

import { cn } from '@/lib/utils'
import { appCopy } from '@/lib/app.copy'

type CascaderOption = {
  value: string
  label: string
  icon?: ReactNode
  description?: string
  keywords?: readonly string[]
  disabled?: boolean
  exclusive?: boolean
  divider?: boolean
}

// Each filter step owns one level. Focus stays in its search box as options change or re-pin.
export function Cascader({
  items,
  selected = [],
  multiple = false,
  onSelect,
  label,
  placeholder = appCopy.filters.searchOptions,
  searchable = true,
  query,
  onQueryChange,
  preFiltered = false,
  maxHeight = 260,
  empty = appCopy.filters.empty,
  autoFocusProps,
  children,
}: {
  items: readonly CascaderOption[]
  selected?: readonly string[]
  multiple?: boolean
  onSelect: (value: string) => void
  label: string
  placeholder?: string
  searchable?: boolean
  query: string
  onQueryChange: (query: string) => void
  preFiltered?: boolean
  maxHeight?: number
  empty?: ReactNode
  autoFocusProps?: { autoFocus: boolean; ref: RefCallback<HTMLElement> }
  children?: ReactNode
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const search = query.trim().toLocaleLowerCase()

  const visible =
    preFiltered || !search
      ? items
      : items.filter((item) =>
          [item.label, item.description, ...(item.keywords ?? [])].some((text) =>
            text?.toLocaleLowerCase().includes(search),
          ),
        )

  const enabled = visible.filter((item) => !item.disabled)
  const active = enabled.find((item) => item.value === highlight) ?? enabled[0]
  const activeIndex = active ? visible.indexOf(active) : -1

  useEffect(() => {
    if (autoFocusProps?.autoFocus !== false) input.current?.focus()
  }, [autoFocusProps?.autoFocus])

  useEffect(() => {
    if (activeIndex >= 0) list.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function move(direction: number) {
    if (!enabled.length) return
    const index = enabled.findIndex((item) => item.value === active?.value)
    setHighlight(enabled[(index + direction + enabled.length) % enabled.length].value)
  }

  return (
    <div data-slot="cascader" className="flex min-w-0 flex-col text-sm">
      <div className={cn('flex items-center gap-2 border-b px-3 py-2', !searchable && 'sr-only')}>
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          {...autoFocusProps}
          ref={(node) => {
            input.current = node
            autoFocusProps?.ref(node)
          }}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
            setHighlight(null)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              move(event.key === 'ArrowDown' ? 1 : -1)
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              setHighlight((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.value ?? null)
            } else if (event.key === 'Enter' && active) {
              event.preventDefault()
              onSelect(active.value)
            }
          }}
        />
      </div>
      <div
        ref={list}
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        style={{ maxHeight }}
        className="overflow-y-auto overscroll-contain p-1"
      >
        {visible.map((item, index) => (
          <div
            key={item.value}
            id={`${id}-${index}`}
            role="option"
            aria-selected={selected.includes(item.value)}
            aria-disabled={item.disabled || undefined}
            data-slot="cascader-item"
            data-highlighted={item === active || undefined}
            className={cn(
              'relative flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
              item.disabled && 'pointer-events-none opacity-50',
              item.divider &&
                'mt-2 before:absolute before:inset-x-0 before:-top-1 before:h-px before:bg-border',
            )}
            onPointerMove={() => {
              if (!item.disabled) setHighlight(item.value)
            }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (!item.disabled) {
                setHighlight(item.value)
                onSelect(item.value)
              }
            }}
          >
            {item.icon ? (
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                {item.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              {item.description ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.exclusive ? (
              <span className="sr-only">{`, ${appCopy.filters.exclusiveHint}`}</span>
            ) : null}
            {selected.includes(item.value) ? (
              <Check aria-hidden className="size-4 shrink-0" />
            ) : (
              <span className="size-4 shrink-0" />
            )}
          </div>
        ))}
      </div>
      {!visible.length ? (
        <p className="px-3 py-5 text-center text-muted-foreground">{empty}</p>
      ) : null}
      {children}
      <span role="status" className="sr-only">
        {appCopy.filters.resultsAnnouncement(visible.length)}
      </span>
    </div>
  )
}
