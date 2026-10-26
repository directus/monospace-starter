import { useState } from 'react'
import type { ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { upcomingBucket, upcomingBuckets } from '@/modules/crm/activity'
import type { UpcomingBucket } from '@/modules/crm/activity'
import { bucketLabels } from '@/modules/crm/components/activity-composer'
import { ActivityRow, LIST_INSET } from '@/modules/crm/components/activity-row'
import type { RowHandlers } from '@/modules/crm/components/activity-row'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { InteractionRow } from '@/modules/crm/data'

const copy = crmCopy.activity

export type { LinkedRecord, RowHandlers } from '@/modules/crm/components/activity-row'

export { LIST_INSET } from '@/modules/crm/components/activity-row'

// Open work grouped by due date. Checkboxes select for the bulk bar; the hover check at the
// row's edge completes; clicking the row opens the detail drawer.
export function TodoList({
  rows,
  bucket,
  selected,
  onSelectedChange,
  handlers,
  footer,
}: {
  rows: Array<InteractionRow>
  // A single bucket shows flat; "all" groups by bucket.
  bucket: UpcomingBucket | 'all'
  // Leave out for no selection (phones): no checkboxes, and rows reclaim the column.
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
  handlers: RowHandlers
  footer?: ReactNode
}) {
  const [at] = useState(() => Date.now())

  const groups =
    bucket === 'all'
      ? upcomingBuckets
          .map((key) => ({ key, items: rows.filter((row) => upcomingBucket(row, at) === key) }))
          .filter((group) => group.items.length > 0)
      : [{ key: bucket, items: rows }]

  const toggle = (ids: Array<string>, on: boolean) => {
    const next = new Set(selected)

    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }

    onSelectedChange?.(next)
  }

  return (
    <div className="@container divide-y">
      {groups.map((group) => {
        const ids = group.items.flatMap((row) => (row.id ? [row.id] : []))
        const picked = ids.filter((id) => selected?.has(id)).length

        return (
          <section key={group.key}>
            <header
              className={cn(
                'sticky top-0 z-10 flex h-9 items-center gap-3 border-b bg-background/95 backdrop-blur max-md:top-(--list-controls-height) max-md:bg-background',
                handlers.inset ?? LIST_INSET,
              )}
            >
              {onSelectedChange ? (
                <Checkbox
                  aria-label={copy.bulk.selectAll(bucketLabels[group.key])}
                  checked={picked > 0 && picked === ids.length}
                  indeterminate={picked > 0 && picked < ids.length}
                  onCheckedChange={(on) => toggle(ids, Boolean(on))}
                />
              ) : null}
              <h2
                className={cn(
                  'text-[11px] font-semibold tracking-wide uppercase',
                  group.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {bucketLabels[group.key]}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">{ids.length}</span>
            </header>
            {group.items.map((row) => (
              <ActivityRow
                key={row.id}
                row={row}
                mode="todo"
                overdue={group.key === 'overdue'}
                selected={Boolean(row.id && selected?.has(row.id))}
                onSelect={onSelectedChange ? (on) => row.id && toggle([row.id], on) : undefined}
                handlers={handlers}
              />
            ))}
          </section>
        )
      })}
      {footer}
    </div>
  )
}
