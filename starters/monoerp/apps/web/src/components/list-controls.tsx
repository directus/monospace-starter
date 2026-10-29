import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { DisplayMenu } from '@/components/data-table/display-menu'
import { FilterTrigger, FilterWell, ListFilters } from '@/components/filters/list-filters'
import { ListToolbar } from '@/components/list-toolbar'
import { Button } from '@/components/ui/button'
import type { ListFilterField, ListFilterQuery } from '@/lib/filters'

type DisplayProps<TData extends object> = ComponentProps<typeof DisplayMenu<TData>>

export function ListControls<TData extends object>({
  state,
  fields,
  title,
  icon,
  selection,
  action,
  defaultSort,
}: {
  state: {
    q: string
    query: ListFilterQuery
    setQ: (q: string) => void
    setFilters: (query: ListFilterQuery) => void
    displayProps?: Omit<DisplayProps<TData>, 'defaultSort'>
  }
  fields: ListFilterField[]
  title: string
  icon: LucideIcon
  selection?: ReactNode
  action?: ReactNode
  defaultSort?: DisplayProps<TData>['defaultSort']
}) {
  return (
    <ListFilters fields={fields} query={state.query} onQueryChange={state.setFilters}>
      <ListToolbar
        title={title}
        icon={icon}
        query={state.q}
        onQueryChange={state.setQ}
        selection={selection}
        action={
          <>
            {state.displayProps && defaultSort ? (
              <DisplayMenu {...state.displayProps} defaultSort={defaultSort} />
            ) : null}
            {action}
          </>
        }
      >
        <FilterTrigger />
      </ListToolbar>
      <FilterWell />
    </ListFilters>
  )
}

export function ListAddButton({
  label,
  icon: Icon = Plus,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  label: string
  icon?: LucideIcon
}) {
  return (
    <Button {...props} className="max-md:ml-auto max-md:w-10 max-md:px-0!">
      <Icon data-icon="inline-start" />
      <span className="max-md:sr-only">{label}</span>
    </Button>
  )
}
