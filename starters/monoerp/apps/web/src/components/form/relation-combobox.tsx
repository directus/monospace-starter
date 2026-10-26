import { Combobox } from '@base-ui/react/combobox'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'

import { EntityAvatar } from '@/components/ui/entity-avatar'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import type { Uuid } from '@/generated/monospace'
import { cn } from '@/lib/utils'

export type RelationOption = {
  value: Uuid
  label: string
  description?: string
  image?: string
  avatar?: boolean
  visual?: 'contact' | 'organization'
  color?: string
}

export function RelationOptionVisual({ option }: { option: RelationOption }) {
  if (option.visual || option.avatar) {
    return (
      <EntityAvatar label={option.label} image={option.image} visual={option.visual ?? 'avatar'} />
    )
  }

  return option.color ? (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: option.color }}
    />
  ) : null
}

// Server-searched single select for linking one record to another. Base UI's built-in
// filtering is disabled so the search callback owns the result list. Pass `searchKey` when
// the callback's results depend on something other than the query (e.g. a parent record).
export function RelationCombobox({
  id,
  value,
  onChange,
  onBlur,
  search,
  searchKey,
  placeholder,
  searchPlaceholder = appCopy.form.typeToSearch,
  disabled = false,
  invalid = false,
  clearable = true,
  defaultOpen = false,
  autoFocus = false,
  describedBy,
  className,
}: {
  id: string
  value: RelationOption | null
  onChange: (option: RelationOption | null) => void
  onBlur?: () => void
  search: (q: string) => Promise<Array<RelationOption>>
  searchKey?: string | null
  placeholder: string
  searchPlaceholder?: string
  disabled?: boolean
  invalid?: boolean
  clearable?: boolean
  defaultOpen?: boolean
  autoFocus?: boolean
  describedBy?: string
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const isMobile = useIsMobile()
  const debouncedQuery = useDebouncedValue(query.trim(), 200)

  const lookup = useQuery({
    queryKey: ['relation-lookup', id, searchKey ?? null, debouncedQuery],
    queryFn: () => search(debouncedQuery),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const results = lookup.data ?? []
  const pending = lookup.isFetching

  const items =
    value && !results.some((option) => option.value === value.value) ? [value, ...results] : results

  return (
    <Combobox.Root
      items={items}
      value={value}
      onValueChange={(next: RelationOption | null) => onChange(next)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)

        if (!next) {
          setQuery('')
          onBlur?.()
        }
      }}
      onInputValueChange={(next) => setQuery(next)}
      filter={null}
      autoHighlight
      disabled={disabled}
      isItemEqualToValue={(option, selected) => option.value === selected.value}
      itemToStringLabel={(option: RelationOption) => option.label}
    >
      <div className={cn('relative', className)}>
        <Combobox.Trigger
          id={id}
          type="button"
          autoFocus={autoFocus}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-background pl-2.5 text-left text-sm transition-[background-color,border-color,color,box-shadow] duration-150 ease-out outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground pointer-coarse:h-10',
            clearable && value ? 'pr-8 pointer-coarse:pr-10' : 'pr-2.5',
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Combobox.Value>
              {(selected: RelationOption | null) =>
                selected ? (
                  <>
                    <RelationOptionVisual option={selected} />
                    <span className="truncate">{selected.label}</span>
                  </>
                ) : (
                  <span className="truncate text-muted-foreground">{placeholder}</span>
                )
              }
            </Combobox.Value>
          </span>
          {!(clearable && value) ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </Combobox.Trigger>
        {clearable && value && !disabled ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={appCopy.form.clearSelection}
            className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:right-1 pointer-coarse:size-8"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={4}
          // On a phone the keyboard resizes the sheet under the trigger, so keep following it.
          disableAnchorTracking={!isMobile}
          className="z-[60] outline-none"
        >
          <Combobox.Popup
            className="flex max-h-(--available-height) w-(--anchor-width) min-w-56 origin-(--transform-origin) flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
            aria-label={placeholder}
          >
            <div className="border-b px-2.5">
              <Combobox.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
            </div>
            <Combobox.Status className="px-2 py-1.5 text-xs text-muted-foreground empty:hidden">
              {pending ? appCopy.search.searching : null}
            </Combobox.Status>
            <Combobox.Empty className="text-center text-sm text-muted-foreground empty:hidden">
              {!pending && debouncedQuery ? (
                <span className="block px-2 py-6">{appCopy.form.noMatches(debouncedQuery)}</span>
              ) : null}
            </Combobox.Empty>
            <Combobox.List className="max-h-56 min-h-0 overflow-y-auto p-1 empty:hidden">
              {(option: RelationOption, index: number) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  index={index}
                  className="grid cursor-default grid-cols-[1fr_1rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <RelationOptionVisual option={option} />
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Combobox.ItemIndicator>
                    <Check className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
