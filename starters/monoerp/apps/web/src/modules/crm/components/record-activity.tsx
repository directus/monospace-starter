import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Uuid } from '@/generated/monospace'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { useCollectionAccess } from '@/lib/permissions'
import { isOpen, sortByDue } from '@/modules/crm/activity'
import { ActivityBulkActions } from '@/modules/crm/components/activity-bulk'
import { Composer } from '@/modules/crm/components/activity-composer'
import { ActivityDetailDrawer } from '@/modules/crm/components/activity-detail'
import type { ActivityDetailMode } from '@/modules/crm/components/activity-detail'
import { LogActivityButton } from '@/modules/crm/components/activity-form'
import type { ActivityDefaults } from '@/modules/crm/components/activity-form'
import { HistoryList } from '@/modules/crm/components/history-list'
import { TodoList } from '@/modules/crm/components/todo-list'
import type { LinkedRecord, RowHandlers } from '@/modules/crm/components/todo-list'
import { crmCopy } from '@/modules/crm/crm.copy'
import { activityView } from '@/modules/crm/data'
import type { ActivityRecord, ActivityView } from '@/modules/crm/data'
import { useDeleteActivity } from '@/modules/crm/mutations'
import type { RecordHistoryEntry } from '@/modules/types'

const copy = crmCopy.activity

const INSET = 'px-3'

// The Activity page, scaled to one record: To do and History tabs, the same rows and detail
// drawer, and under the To do list its own composer for the next task. `hide` names the record
// the section sits on so rows and the drawer don't repeat it.
export function RecordActivity({
  activities,
  extraEntries = [],
  defaults,
  hide,
  emptyMessage,
}: {
  activities: Array<ActivityRecord>
  extraEntries?: Array<RecordHistoryEntry>
  defaults: ActivityDefaults
  hide: ReadonlyArray<LinkedRecord>
  emptyMessage: string
}) {
  const access = useCollectionAccess('activities')
  const [now] = useState(() => Date.now())
  const todo = sortByDue(activities.filter(isOpen))
  const history = activities.filter((row) => !isOpen(row))
  // Open work first when there is any, otherwise straight to what happened.
  const [view, setView] = useState<ActivityView>(todo.length ? 'todo' : 'history')
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const isMobile = useIsMobile()
  const [selected, select] = useState<{ id: Uuid; mode: ActivityDetailMode } | null>(null)
  const [deleting, setDeleting] = useState<ActivityRecord>()
  const remove = useDeleteActivity()
  const selectedRow = activities.find((row) => row.id === selected?.id) ?? null
  const checkedIds = activities.flatMap((row) => (row.id && checked.has(row.id) ? [row.id] : []))

  const switchView = (next: ActivityView) => {
    setView(next)
    setChecked(new Set())
  }

  const handlers: RowHandlers = {
    onOpen: (row) => row.id && select({ id: row.id, mode: 'view' }),
    onEdit: (row) => row.id && select({ id: row.id, mode: 'edit' }),
    onDelete: (row) => {
      remove.reset()
      setDeleting(row)
    },
    hide,
    inset: INSET,
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onValueChange={(next) => {
            const parsed = activityView.safeParse(next)

            if (parsed.success) switchView(parsed.data)
          }}
        >
          <TabsList>
            <TabsTrigger value="todo" className="gap-1.5">
              {copy.todo}
              <span className="text-xs text-muted-foreground tabular-nums">{todo.length}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              {copy.history}
              <span className="text-xs text-muted-foreground tabular-nums">
                {history.length + extraEntries.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          {checkedIds.length && !isMobile ? (
            <ActivityBulkActions ids={checkedIds} onClear={() => setChecked(new Set())} />
          ) : access.create ? (
            <LogActivityButton defaults={defaults} />
          ) : null}
        </div>
      </header>

      {view === 'todo' && todo.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <TodoList
            rows={todo}
            bucket="all"
            selected={isMobile ? undefined : checked}
            onSelectedChange={isMobile ? undefined : setChecked}
            handlers={handlers}
          />
        </div>
      ) : null}
      {view === 'todo' && access.create ? <Composer defaults={defaults} /> : null}
      {view === 'history' ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          {history.length || extraEntries.length ? (
            <HistoryList
              rows={history}
              extraEntries={extraEntries}
              now={now}
              selected={isMobile ? undefined : checked}
              onSelectedChange={isMobile ? undefined : setChecked}
              handlers={handlers}
            />
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </div>
      ) : null}

      <ActivityDetailDrawer
        row={selectedRow}
        mode={selected?.mode ?? 'view'}
        hide={hide}
        onModeChange={(mode) => select((current) => (current ? { ...current, mode } : null))}
        onOpenChange={(open) => !open && select(null)}
        onDelete={handlers.onDelete}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        noun={copy.singular}
        name={deleting?.subject ?? copy.untitled}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => {
          if (!deleting?.id) return
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(undefined)

              if (selected?.id === deleting.id) select(null)
            },
          })
        }}
      />
    </section>
  )
}
