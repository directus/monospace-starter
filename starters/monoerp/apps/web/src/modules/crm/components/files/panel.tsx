import { fileIcons, kindOf } from './file-kind'
import { useCollectionAccess } from '@/lib/permissions'
import { useQuery } from '@tanstack/react-query'
import { Link2, Loader2, Paperclip, Upload } from 'lucide-react'
import type { DragEvent } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentScope, AttachmentTarget } from '@/modules/crm/data'
import { attachmentsQuery } from '@/modules/crm/data'

import { FileCard, tileClass } from './card'
import { AddLinkDialog } from './link-dialog'
import type { Hide, UploadItem } from './types'
import { useFilePicker, useUploads } from './uploads'

const copy = crmCopy.files

// The Files tab: a card grid. Images show themselves, links show the site's logo, everything
// else a type icon. Hover a card for its actions; click it for the drawer. `hide` drops the
// context pill for the page's own record. Activity files only show inside their activity.
export function AttachmentsPanel({
  scope,
  target,
  hide,
  emptyMessage,
  variant = 'card',
}: {
  scope: AttachmentScope
  // Where new files go. Without one (the record's organization is hidden) the panel is read-only.
  target?: AttachmentTarget
  hide: Hide
  emptyMessage: string
  // `inline` drops the card chrome for use inside a drawer section.
  variant?: 'card' | 'inline'
}) {
  const access = useCollectionAccess('attachments')
  const canAdd = Boolean(target) && access.create
  const rows = useQuery(attachmentsQuery(scope))
  const { uploads, add, dismiss } = useUploads()
  const picker = useFilePicker((files) => canAdd && target && add(files, target))
  const [dragging, setDragging] = useState(false)
  const [linking, setLinking] = useState(false)
  const items = rows.data ?? []
  const empty = !rows.isPending && items.length === 0 && uploads.length === 0

  // Only files coming from outside the page. Dialogs render in portals but their React events
  // still bubble here, and dragging a preview image would otherwise re-upload it.
  const external = (event: DragEvent) =>
    canAdd &&
    event.target instanceof Node &&
    event.currentTarget.contains(event.target) &&
    event.dataTransfer.types.includes('Files') &&
    !event.dataTransfer.types.includes('text/uri-list')

  const onDrop = (event: DragEvent) => {
    if (!external(event)) return
    event.preventDefault()
    setDragging(false)

    if (canAdd && target && event.dataTransfer.files.length) {
      void add(Array.from(event.dataTransfer.files), target)
    }
  }

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={() => setLinking(true)}>
        <Link2 data-icon="inline-start" />
        {copy.addLink}
      </Button>
      <Button size="sm" variant="outline" onClick={picker.pick}>
        {variant === 'card' ? (
          <Upload data-icon="inline-start" />
        ) : (
          <Paperclip data-icon="inline-start" />
        )}
        {variant === 'card' ? copy.upload : copy.attach}
      </Button>
    </>
  )

  return (
    <div
      onDragOver={(event) => {
        if (!external(event)) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget

        if (!(next instanceof Node && event.currentTarget.contains(next))) setDragging(false)
      }}
      onDrop={onDrop}
      className={cn(
        '@container relative transition-colors',
        variant === 'card' && 'overflow-hidden rounded-xl border bg-card',
        dragging && 'ring-3 ring-ring/50',
      )}
    >
      {picker.input}
      {canAdd && target ? (
        <AddLinkDialog open={linking} onOpenChange={setLinking} target={target} />
      ) : null}
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 text-sm font-medium backdrop-blur-xs">
          <Upload className="mr-2 size-4" />
          {copy.dropActive}
        </div>
      ) : null}
      {variant === 'card' && canAdd ? (
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <p className="text-sm text-muted-foreground">
            {copy.dropHint}{' '}
            <button
              type="button"
              className="font-medium text-foreground hover:underline"
              onClick={picker.pick}
            >
              {copy.browse}
            </button>
          </p>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      ) : null}
      {rows.isError ? (
        <p className="px-5 py-4 text-sm text-destructive">{errorMessage(rows.error)}</p>
      ) : null}
      {rows.isPending ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : null}
      {empty ? (
        <p
          className={cn('text-sm text-muted-foreground', variant === 'card' ? 'px-5 py-4' : 'py-1')}
        >
          {emptyMessage}
        </p>
      ) : null}
      {!empty ? (
        <ul
          className={cn(
            'grid gap-3',
            variant === 'card'
              ? 'grid-cols-2 p-4 @xl:grid-cols-3 @4xl:grid-cols-4'
              : 'grid-cols-2 @lg:grid-cols-3',
          )}
        >
          {uploads.map((item) => (
            <UploadCard key={item.key} upload={item} onDismiss={() => dismiss(item.key)} />
          ))}
          {items.map((row) => (
            <FileCard key={row.id} row={row} hide={hide} />
          ))}
        </ul>
      ) : null}
      {variant === 'inline' && canAdd ? <div className="mt-3 flex gap-2">{actions}</div> : null}
    </div>
  )
}

function UploadCard({ upload, onDismiss }: { upload: UploadItem; onDismiss: () => void }) {
  const Icon = fileIcons[kindOf({ contentType: upload.file.type })]

  return (
    <li className={cn(tileClass, 'flex flex-col items-center justify-center gap-2 p-3')}>
      <Icon className="size-8 text-muted-foreground" />
      <p className="w-full truncate text-center text-xs">{upload.file.name}</p>
      {upload.failed ? (
        <>
          <p className="text-xs text-destructive">{copy.uploadFailed(upload.file.name)}</p>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            {appCopy.common.close}
          </Button>
        </>
      ) : (
        <div className="h-1 w-2/3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.max(4, Math.round(upload.progress * 100))}%` }}
          />
        </div>
      )}
    </li>
  )
}
