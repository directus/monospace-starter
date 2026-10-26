import { ChevronDown, ListFilterIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  FilterChip,
  Filters,
  FiltersBuilder,
  flattenFilterRules,
  useFilterActions,
  useFilterState,
} from '@/components/reui/filters/filters'
import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'

// reUI filters (components/reui/filters) laid out the CRM way: the "Filter" button sits in the
// list toolbar and the active rules show as chips in a well underneath with a clear-all. Wrap
// the toolbar and the well in `ListFilters` so both share one filter context.

export function ListFilters({
  fields,
  query,
  onQueryChange,
  children,
}: {
  fields: Array<ListFilterField>
  query: ListFilterQuery
  onQueryChange: (query: ListFilterQuery) => void
  children: ReactNode
}) {
  return (
    <Filters fields={fields} query={query} onQueryChange={onQueryChange}>
      {children}
    </Filters>
  )
}

export function FilterTrigger() {
  return (
    <FiltersBuilder
      trigger={
        <Button
          variant="outline"
          className="[&[data-popup-open]_[data-icon=inline-end]]:rotate-180"
        >
          <ListFilterIcon data-icon="inline-start" />
          {appCopy.filters.add}
          <ChevronDown data-icon="inline-end" className="transition-transform" />
        </Button>
      }
    />
  )
}

export function FilterWell() {
  const actions = useFilterActions()
  const { query, ruleCount } = useFilterState()
  const rules = flattenFilterRules(query)

  if (!ruleCount) return null

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 md:flex-wrap">
      <div
        role="toolbar"
        aria-label={actions.labels.filtersLabel}
        className="flex items-center gap-2 max-md:min-w-0 max-md:flex-1 max-md:overflow-x-auto max-md:*:shrink-0 md:flex-wrap"
      >
        {rules.map((rule, index) => (
          <FilterChip key={rule.id} rule={rule} index={index} />
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="ms-auto shrink-0 text-muted-foreground"
        onClick={() => actions.clearQuery()}
      >
        {appCopy.filters.clearAll}
      </Button>
    </div>
  )
}
