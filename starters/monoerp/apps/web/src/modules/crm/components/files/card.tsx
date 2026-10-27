import { useCollectionAccess } from '@/lib/permissions'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { appCopy } from '@/lib/app.copy'
import { formatBytes } from '@/lib/assets'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentRow } from '@/modules/crm/data'
import { useDeleteAttachment } from '@/modules/crm/mutations'

import { FileActions } from './actions'
import { ContextPill, FileDrawer } from './drawer'
import { hostOf, kindOf } from './file-kind'
import { FilePreview, Lightbox } from './preview'
import type { Hide } from './types'

const copy = crmCopy.files

export const tileClass =
  'relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/40 text-left outline-none'

const surfaceClass =
  'absolute inset-0 size-full cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

export function FileCard({ row, hide }: { row: AttachmentRow; hide: Hide }) {
  const access = useCollectionAccess('attachments')
  const [viewing, setViewing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useDeleteAttachment()
  const name = row.fileName ?? ''
  const kind = kindOf(row)

  const askDelete = () => {
    remove.reset()
    setDeleting(true)
  }

  return (
    <li className={cn(tileClass, 'group/card')}>
      {kind === 'link' ? (
        <a
          href={row.url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className={surfaceClass}
          aria-label={name}
        >
          <FilePreview row={row} cover />
        </a>
      ) : (
        <button
          type="button"
          className={surfaceClass}
          aria-label={name}
          onClick={() => setViewing(true)}
        >
          <FilePreview row={row} cover />
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/35 to-transparent px-3 pt-8 pb-2.5 text-white transition-[padding] group-hover/card:pr-32">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="truncate text-[11px] text-white/75">
          {[
            kind === 'link' ? hostOf(row.url) : formatBytes(row.sizeBytes),
            formatDate(row.createdAt),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="pointer-events-none absolute top-2 left-2 opacity-0 transition-opacity group-hover/card:opacity-100">
        <ContextPill row={row} hide={hide} />
      </div>
      {kind === 'link' ? (
        <div className="pointer-events-none absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-neutral-900 opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover/card:opacity-100 pointer-coarse:hidden">
          <ExternalLink className="size-3.5" />
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1.5 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 pointer-coarse:top-2 pointer-coarse:bottom-auto [@media(hover:hover)]:opacity-0">
        <FileActions
          row={row}
          onExpand={() => setExpanded(true)}
          onDelete={access.delete ? askDelete : undefined}
        />
      </div>
      {kind !== 'link' ? (
        <>
          <FileDrawer
            row={row}
            hide={hide}
            open={viewing}
            onOpenChange={setViewing}
            onExpand={() => setExpanded(true)}
            onDelete={access.delete ? askDelete : undefined}
          />
          <Lightbox row={row} open={expanded} onOpenChange={setExpanded} />
        </>
      ) : null}
      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        noun={kind === 'link' ? copy.link : copy.singular}
        name={name}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          remove.mutate(
            { id: row.id ?? '', assetId: row.assetId ?? null },
            { onSuccess: () => setDeleting(false) },
          )
        }
      />
    </li>
  )
}

// The round buttons that float over a preview, kept to a corner so the middle of a card
// still opens the drawer (or the link itself): copy link or full screen, download, delete.
