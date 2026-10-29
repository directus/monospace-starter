import { ListFilterPlusIcon } from 'lucide-react'
import * as React from 'react'

import { Cascader } from '@/components/filters/cascader'
import {
  filterControlSizes,
  filterReadOnlyProps,
  useFilterActions,
  useFilterState,
} from '@/components/filters/context'
import { FILTER_FIELD_PICKER_CLASS, getFilterField } from '@/components/filters/helpers'
import { getDefaultFilterOperator } from '@/components/filters/operators'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function FilterFieldPicker<V, O>({
  query,
  onQueryChange,
  onSelect,
}: {
  query: string
  onQueryChange: (query: string) => void
  onSelect: (path: string[], defaultOperator: string | null) => void
}) {
  const actions = useFilterActions<V, O>()

  return (
    <Cascader
      items={actions.index.roots.map((field) => ({
        value: field.id,
        label: field.label,
        icon: field.icon,
        description: field.description,
        keywords: field.keywords,
        disabled: field.disabled,
      }))}
      label={actions.labels.fieldsLabel}
      placeholder={actions.labels.searchFields}
      query={query}
      onQueryChange={onQueryChange}
      onSelect={(id) => {
        const field = getFilterField(actions.index, [id])

        if (field) onSelect([id], getDefaultFilterOperator(field, actions.resolveOperators(field)))
      }}
    />
  )
}

function FieldStep<V, O>() {
  const actions = useFilterActions<V, O>()
  const { draft } = useFilterState<V>()

  return (
    <FilterFieldPicker<V, O>
      query={draft?.query ?? ''}
      onQueryChange={(query) => actions.dispatchDraft({ type: 'setQuery', query })}
      onSelect={(path, defaultOperator) =>
        actions.dispatchDraft({ type: 'selectField', path, defaultOperator })
      }
    />
  )
}

interface FiltersBuilderProps {
  trigger?: React.ReactElement
  className?: string
}

export function FiltersBuilder<V, O>({ trigger, className }: FiltersBuilderProps) {
  const actions = useFilterActions<V, O>()
  const sizes = filterControlSizes(actions)
  const { draft, ruleCount } = useFilterState<V>()
  const open = draft !== null && draft.ruleId === null
  // The HANDOFF close, the one that must not FADE: the panel is a 224px card
  // dissolving over the very menu the user is now meant to read.
  const committing = draft !== null && draft.ruleId === null && draft.status === 'ready'
  // LATCHED, because `committing` is true for one render only, before the exit
  // it suppresses begins. Adjusted during render; an effect is one frame late.
  const [instantExit, setInstantExit] = React.useState(false)

  if (committing && !instantExit) setInstantExit(true)
  else if (open && !committing && instantExit) setInstantExit(false)
  // Icon-only once chips sit beside it. Both states come off ONE size ladder,
  // so they share height and radius in every style at every bar size. The
  // hardcoded `icon`/`default` pair this replaced IS the `default` rung, so it
  // drifted the moment the bar was `sm`.
  const compact = ruleCount > 0

  // Base UI's own microtask-then-rAF ordering hands focus to the new chip, NOT
  // anything this file arranges. Suppressing the close restore with
  // `finalFocus` only removes the fallback that keeps focus off the BODY.

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) actions.closeDraft()
        else actions.openCreate()
      }}
    >
      <PopoverTrigger
        disabled={actions.disabled}
        {...filterReadOnlyProps(actions)}
        render={
          trigger ? (
            trigger
          ) : (
            <Button
              variant="outline"
              size={compact ? sizes.icon : sizes.button}
              aria-label={compact ? actions.labels.addFilter : undefined}

              className="transition-[color,background-color,border-color,box-shadow]"
            >
              <ListFilterPlusIcon />
              {compact ? null : actions.labels.addFilter}
            </Button>
          )
        }
      />

      <PopoverContent
        align="start"
        className={cn(
          FILTER_FIELD_PICKER_CLASS,

          instantExit &&
            cn(
              'data-ending-style:animate-none data-ending-style:transition-none',
              'data-[state=closed]:animate-none data-[state=closed]:transition-none',
            ),
          actions.fieldPickerClassName,
          className,
        )}
      >
        <FieldStep<V, O> />
      </PopoverContent>
    </Popover>
  )
}
