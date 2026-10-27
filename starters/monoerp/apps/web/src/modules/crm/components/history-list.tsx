import type { ReactNode } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { timeOnly } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ActivityRow, LIST_INSET } from '@/modules/crm/components/activity-row'
import type { RowHandlers } from '@/modules/crm/components/activity-row'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { ActivityRecord } from '@/modules/crm/data'
import type { RecordHistoryEntry } from '@/modules/types'

const copy = crmCopy.activity

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' })

const monthYearLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const DAY = 86_400_000

// History is about when something took place: `occurredAt` (the due time for a task that was
// completed, the entered time for a logged call). Completion time is only in the drawer.
function happenedAt(row: ActivityRecord) {
  return row.occurredAt ?? row.completedAt ?? ''
}

// Coarse buckets so a sparse list doesn't get a header per row: the last two weeks by
// closeness, everything older by month. Rows in the near buckets show just the time; month
// buckets carry the date on each row.
function bucketOf(iso: string, now: number) {
  const date = new Date(iso)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const days = Math.floor((start.getTime() - new Date(date).setHours(0, 0, 0, 0)) / DAY)

  if (days <= 0) return { label: copy.upcoming.today, dated: false }

  if (days === 1) return { label: copy.past.yesterday, dated: false }

  if (days < 7) return { label: copy.upcoming.week, dated: false }

  if (days < 14) return { label: copy.past.lastWeek, dated: false }
  const sameYear = date.getFullYear() === start.getFullYear()

  return { label: (sameYear ? monthLabel : monthYearLabel).format(date), dated: true }
}

type Entry =
  | { kind: 'activity'; at: string; row: ActivityRecord }
  | { kind: 'external'; at: string; entry: RecordHistoryEntry }

// What happened, newest first, one line per entry, under sticky bucket headers. No counts in
// the headers: "August 2" reads as a date. Selection works like To do: a checkbox per row and
// one per group. `extraEntries` are read-only source entries, merged in by time;
// they can't be selected or edited.
export function HistoryList({
  rows,
  extraEntries = [],
  now,
  selected,
  onSelectedChange,
  handlers,
  footer,
}: {
  rows: Array<ActivityRecord>
  extraEntries?: Array<RecordHistoryEntry>
  now: number
  // Leave out for no selection (phones): no checkboxes, and rows reclaim the column.
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
  handlers: RowHandlers
  footer?: ReactNode
}) {
  const toggle = (ids: Array<string>, on: boolean) => {
    const next = new Set(selected)

    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }

    onSelectedChange?.(next)
  }

  const entries: Array<Entry> = [
    ...rows.map((row): Entry => ({ kind: 'activity', at: happenedAt(row), row })),
    ...extraEntries.map((entry): Entry => ({ kind: 'external', at: entry.at, entry })),
  ]

  if (extraEntries.length) entries.sort((left, right) => right.at.localeCompare(left.at))

  const groups: Array<{ key: string; label: string; dated: boolean; items: Array<Entry> }> = []
  // Rows sort by occurredAt but bucket by occurredAt ?? completedAt, so a label can come back.
  const repeats = new Map<string, number>()

  for (const entry of entries) {
    const bucket = bucketOf(entry.at, now)
    const last = groups[groups.length - 1]

    if (last?.label === bucket.label) last.items.push(entry)
    else {
      const seen = repeats.get(bucket.label) ?? 0
      repeats.set(bucket.label, seen + 1)
      groups.push({
        ...bucket,
        key: seen ? `${bucket.label}-${seen}` : bucket.label,
        items: [entry],
      })
    }
  }

  return (
    <div className="@container divide-y">
      {groups.map((group) => {
        const ids = group.items.flatMap((entry) =>
          entry.kind === 'activity' && entry.row.id ? [entry.row.id] : [],
        )

        const picked = ids.filter((id) => selected?.has(id)).length
        const format = group.dated ? dateTime : timeOnly

        return (
          <section key={group.key}>
            <header
              className={cn(
                'sticky top-0 z-10 flex h-9 items-center gap-3 border-b bg-background/95 backdrop-blur max-md:top-(--list-controls-height) max-md:bg-background',
                handlers.inset ?? LIST_INSET,
              )}
            >
              {!onSelectedChange ? null : ids.length ? (
                <Checkbox
                  aria-label={copy.bulk.selectAll(group.label)}
                  checked={picked > 0 && picked === ids.length}
                  indeterminate={picked > 0 && picked < ids.length}
                  onCheckedChange={(on) => toggle(ids, Boolean(on))}
                />
              ) : (
                <span className="size-4" />
              )}
              <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h2>
            </header>
            {group.items.map((entry) =>
              entry.kind === 'external' ? (
                <div key={entry.entry.id}>
                  {entry.entry.render(format.format(new Date(entry.at)), handlers.inset)}
                </div>
              ) : (
                <ActivityRow
                  key={entry.row.id}
                  row={entry.row}
                  mode="history"
                  when={format.format(new Date(entry.at))}
                  selected={Boolean(entry.row.id && selected?.has(entry.row.id))}
                  onSelect={
                    onSelectedChange
                      ? (on) => entry.row.id && toggle([entry.row.id], on)
                      : undefined
                  }
                  handlers={handlers}
                />
              ),
            )}
          </section>
        )
      })}
      {footer}
    </div>
  )
}
