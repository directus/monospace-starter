import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { NavigateOptions } from '@tanstack/react-router'
import { ArrowRight, CornerDownLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EntityAvatar } from '@/components/avatars'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { appCopy } from '@/lib/app.copy'
import { moduleById, modules } from '@/lib/modules'
import type { SearchHit, SearchScope } from '@/lib/modules'
import { usePages } from '@/lib/modules/pages'
import { cn } from '@/lib/utils'
import { commandPaletteKey } from '@/shell/query-keys'

const MIN_QUERY_LENGTH = 2

const scopes: SearchScope[] = modules.flatMap((module) => module.search?.scopes ?? [])

async function searchAll(q: string, scopeId?: string) {
  const providers = modules.flatMap((module) => (module.search ? [module.search] : []))

  const results = await Promise.all(
    providers
      .filter((provider) => !scopeId || provider.scopes.some((scope) => scope.id === scopeId))
      .map((provider) => provider.search(q, scopeId)),
  )

  return results.flat()
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const pages = usePages()
  const [query, setQuery] = useState('')
  const [scopeId, setScopeId] = useState<string>()
  const debouncedQuery = useDebouncedValue(query.trim(), 200)
  const canSearch = debouncedQuery.length >= MIN_QUERY_LENGTH

  const results = useQuery({
    queryKey: [...commandPaletteKey, scopeId ?? 'all', debouncedQuery],
    queryFn: () => searchAll(debouncedQuery, scopeId),
    enabled: open && canSearch,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('')
      setScopeId(undefined)
    }

    onOpenChange(next)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        handleOpenChange(!open)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const matchingPages = useMemo(() => {
    if (scopeId) return []
    const needle = query.trim().toLowerCase()

    return pages.filter(
      (page) =>
        !needle ||
        page.title.toLowerCase().includes(needle) ||
        page.keywords?.some((keyword) => keyword.includes(needle)),
    )
  }, [pages, query, scopeId])

  function go(options: NavigateOptions) {
    handleOpenChange(false)
    void navigate(options)
  }

  function openHit(hit: SearchHit) {
    go(hit.link)
  }

  function cycleScope(direction: 1 | -1) {
    const order = [undefined, ...scopes.map((scope) => scope.id)]
    const index = order.indexOf(scopeId)
    setScopeId(order[(index + direction + order.length) % order.length])
  }

  const activeScope = scopes.find((scope) => scope.id === scopeId)
  const groups = canSearch ? (results.data ?? []) : []

  const showEmpty =
    canSearch && !results.isPending && groups.length === 0 && matchingPages.length === 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={appCopy.search.title}
      description={appCopy.search.description}
      className="top-2 sm:top-[12vh] sm:max-w-2xl"
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            activeScope
              ? appCopy.search.scopedPlaceholder(activeScope.label)
              : appCopy.search.placeholder
          }
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              event.preventDefault()
              cycleScope(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Backspace' && query === '' && scopeId) {
              event.preventDefault()
              setScopeId(undefined)
            }
          }}
        />
        <CommandList className="h-72 max-h-[40dvh] sm:max-h-[50vh]">
          {showEmpty ? <CommandEmpty>{appCopy.search.empty(debouncedQuery)}</CommandEmpty> : null}
          {canSearch && results.isPending && matchingPages.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {appCopy.search.searching}
            </div>
          ) : null}

          {groups.map((group) => {
            const scope = scopes.find((item) => item.id === group.scopeId)

            if (!scope) return null

            return (
              <CommandGroup key={group.scopeId} heading={scope.label}>
                {group.hits.map((hit) => (
                  <CommandItem
                    key={`${group.scopeId}:${hit.id}`}
                    value={`hit:${group.scopeId}:${hit.id}`}
                    onSelect={() => openHit(hit)}
                  >
                    {hit.variant ? (
                      <EntityAvatar label={hit.title} image={hit.image} variant={hit.variant} />
                    ) : (
                      <scope.icon className="text-muted-foreground" />
                    )}
                    <span className="truncate">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
                <CommandItem
                  value={`more:${group.scopeId}`}
                  onSelect={() => go(scope.list(debouncedQuery))}
                  className="text-muted-foreground"
                >
                  <ArrowRight />
                  <span>{appCopy.search.showAll(scope.label, debouncedQuery)}</span>
                </CommandItem>
              </CommandGroup>
            )
          })}

          {groups.length > 0 && matchingPages.length > 0 ? <CommandSeparator /> : null}

          {matchingPages.length > 0 ? (
            <CommandGroup heading={appCopy.search.pagesGroup}>
              {matchingPages.map((page) => {
                const module = moduleById(page.module)

                return (
                  <CommandItem
                    key={page.to}
                    value={`page:${page.to}`}
                    onSelect={() => go({ to: page.to })}
                  >
                    {page.icon ? <page.icon className="text-muted-foreground" /> : null}
                    <span>{page.title}</span>
                    {module ? (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        {module.label}
                      </Badge>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ) : null}
        </CommandList>
        <div className="flex items-center justify-between gap-4 border-t px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <ScopeChip
              label={appCopy.search.allScope}
              active={!scopeId}
              onClick={() => setScopeId(undefined)}
            />
            {scopes.map((scope) => (
              <ScopeChip
                key={scope.id}
                label={scope.label}
                icon={scope.icon}
                active={scope.id === scopeId}
                onClick={() => setScopeId(scope.id)}
              />
            ))}
          </div>
          <div className="hidden shrink-0 items-center gap-3 text-[11px] whitespace-nowrap text-muted-foreground sm:flex">
            <span>{appCopy.search.hints.scope}</span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="size-3" /> {appCopy.search.hints.open}
            </span>
            <span>{appCopy.search.hints.navigate}</span>
            <span>{appCopy.search.hints.close}</span>
          </div>
        </div>
      </Command>
    </CommandDialog>
  )
}

function ScopeChip({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon?: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <Badge
      variant={active ? 'default' : 'outline'}
      className={cn('cursor-pointer', !active && 'text-muted-foreground hover:bg-muted')}
      render={<button type="button" onClick={onClick} aria-pressed={active} />}
    >
      {Icon ? <Icon /> : null}
      {label}
    </Badge>
  )
}
