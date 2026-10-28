import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading } from '@/components/data-state'
import { FormDialog } from '@/components/form/form-dialog'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { movedPosition } from '@/modules/ats/mutations/home'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

const copy = atsSettingsCopy.atsList

type Row = { id: Uuid; name: string | null; position?: number | null }

type Texts = {
  title: string
  description: string
  add: string
  emptyTitle: string
  emptyDescription: string
  deleteDescription: string
}

// The settings pages for the ATS's lookup tables: a header, one framed list, an add row, and a
// delete confirm. Lists with a `position` drag to reorder. Each page brings its own editor.
export function AtsSettingsList<T extends Row>({
  texts,
  icon: Icon,
  query,
  remove,
  reorder,
  renderRow,
  renderEditor,
}: {
  texts: Texts
  icon: LucideIcon
  query: UseQueryResult<Array<T>>
  remove: UseMutationResult<unknown, Error, Uuid>
  reorder?: UseMutationResult<unknown, Error, { id: Uuid; position: number }>
  renderRow: (row: T) => ReactNode
  // `row` undefined means a new one. Call `close` once saved or cancelled.
  renderEditor: (row: T | undefined, close: () => void) => ReactNode
}) {
  const [editing, setEditing] = useState<{ row?: T }>()
  const [deleting, setDeleting] = useState<T>()
  const [override, setOverride] = useState<Array<T>>()
  const rows = override ?? query.data ?? []
  const busy = remove.isPending || Boolean(reorder?.isPending)
  const startAdding = () => setEditing({})

  return (
    <div className="space-y-7">
      <PageHeader
        title={texts.title}
        description={texts.description}
        actions={
          query.isSuccess ? (
            <Button disabled={busy} onClick={startAdding}>
              <Plus />
              {texts.add}
            </Button>
          ) : undefined
        }
      />
      {query.isPending ? (
        <DataLoading rows={6} />
      ) : query.isError ? (
        <DataError error={query.error} />
      ) : query.data.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 rounded-xl bg-muted p-3">
            <Icon className="size-6 text-muted-foreground" />
          </div>
          <h2 className="font-medium">{texts.emptyTitle}</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{texts.emptyDescription}</p>
          <Button className="mt-5" onClick={startAdding}>
            <Plus />
            {texts.add}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Frame dense>
            <FrameHeader className="flex-row items-center gap-2 px-4 py-3">
              <FrameTitle>{texts.title}</FrameTitle>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                {query.data.length}
              </span>
              {reorder?.isPending ? (
                <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                  {copy.savingOrder}
                </p>
              ) : null}
            </FrameHeader>
            <DragDropProvider
              onDragEnd={(event) => {
                if (event.canceled || busy || !reorder) return
                const { source } = event.operation

                if (!isSortable(source) || source.initialIndex === source.index) return
                const move = movedPosition(query.data, source.initialIndex, source.index)

                if (!move) return
                // Commit the new order before a fast rejection can batch it away.
                flushSync(() => setOverride(move.ordered))
                reorder.mutate(
                  { id: move.id, position: move.position },
                  { onSettled: () => setOverride(undefined) },
                )
              }}
            >
              <FramePanel className="overflow-visible">
                <ol
                  aria-label={texts.title}
                  className="divide-y [&>li:first-child]:rounded-t-xl [&>li:last-child]:rounded-b-xl"
                >
                  {rows.map((row, index) => (
                    <ListRow
                      key={row.id}
                      row={row}
                      index={index}
                      sortable={Boolean(reorder)}
                      canDrag={Boolean(reorder) && !busy && !editing && !deleting}
                      onEdit={() => setEditing({ row })}
                      onDelete={() => {
                        remove.reset()
                        setDeleting(row)
                      }}
                    >
                      {renderRow(row)}
                    </ListRow>
                  ))}
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={startAdding}
                      className="flex w-full items-center gap-2 rounded-b-xl px-4 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <span className="p-1">
                        <Plus className="size-4" />
                      </span>
                      {texts.add}
                    </button>
                  </li>
                </ol>
              </FramePanel>
            </DragDropProvider>
          </Frame>
          {reorder?.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(reorder.error, copy.orderFailed)}
            </p>
          ) : null}
          {reorder ? (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <GripVertical className="size-4 shrink-0" />
              <p>{copy.dragHelp}</p>
            </div>
          ) : null}
        </div>
      )}
      {editing ? renderEditor(editing.row, () => setEditing(undefined)) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={copy.deleteTitle(deleting?.name ?? '')}
        description={texts.deleteDescription}
        confirmLabel={copy.delete}
        pendingLabel={copy.deleting}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, copy.deleteFailed) : undefined}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }}
      />
    </div>
  )
}

function ListRow({
  row,
  index,
  sortable,
  canDrag,
  onEdit,
  onDelete,
  children,
}: {
  row: Row
  index: number
  sortable: boolean
  canDrag: boolean
  onEdit: () => void
  onDelete: () => void
  children: ReactNode
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: row.id,
    index,
    type: 'ats-settings-row',
    accept: 'ats-settings-row',
    disabled: !canDrag,
  })

  const name = row.name ?? ''

  return (
    <li
      ref={ref}
      aria-label={name}
      className={cn(
        'relative flex items-center gap-2 bg-card px-3 py-2 transition-[background-color,box-shadow] hover:bg-muted/20 motion-reduce:transition-none sm:gap-3 sm:px-4',
        isDragging && 'z-10 rounded-lg shadow-lg ring-2 ring-ring',
      )}
    >
      {sortable ? (
        <>
          <Button
            ref={handleRef}
            variant="ghost"
            size="icon-sm"
            aria-label={copy.move(name)}
            disabled={!canDrag}
            className="-ml-1 shrink-0 cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
          >
            <GripVertical />
          </Button>
          <span className="hidden w-5 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:block">
            {String(index + 1).padStart(2, '0')}
          </span>
        </>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 rounded py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2"
      >
        {children}
      </button>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={`${copy.edit} ${name}`} onClick={onEdit}>
          <Pencil className="text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${copy.delete} ${name}`}
          onClick={onDelete}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
    </li>
  )
}

// The add/edit dialog every list page uses: the page's fields, any save error, and the actions.
export function AtsSettingsEditor({
  title,
  onClose,
  onSubmit,
  error,
  submit,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  error?: string
  submit: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      className={wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSubmit()
        }}
      >
        {children}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {appCopy.common.cancel}
          </Button>
          {submit}
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
