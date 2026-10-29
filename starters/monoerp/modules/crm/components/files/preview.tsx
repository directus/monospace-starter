import { Download, X } from 'lucide-react'
import { useState } from 'react'

import { PdfViewer } from '@/components/pdf-viewer'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { appCopy } from '@/lib/app.copy'
import { assetUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentRow } from '@/modules/crm/data'
import { organizationLogo } from '@/modules/crm/entities'

import { HoverAction } from './actions'
import { fileIcons, hostOf, kindOf } from './file-kind'

const copy = crmCopy.files

// What an attachment looks like: the image itself, the site logo for a link, or a type icon.
// `cover` fills a tile; otherwise PDFs render page by page.
export function FilePreview({
  row,
  cover = false,
  className,
}: {
  row: AttachmentRow
  cover?: boolean
  className?: string
}) {
  const name = row.fileName ?? ''
  const kind = kindOf(row)
  const [failed, setFailed] = useState(false)
  const logo = kind === 'link' ? organizationLogo(hostOf(row.url)) : undefined

  if (kind === 'image' && !failed) {
    return (
      <img
        src={assetUrl(row.assetId ?? '', name)}
        alt={name}
        draggable={false}
        onError={() => setFailed(true)}
        className={cn(
          cover ? 'size-full object-cover' : 'mx-auto block max-h-[50vh] max-w-full object-contain',
          className,
        )}
      />
    )
  }

  if (kind === 'pdf' && !cover && !failed) {
    return (
      <PdfViewer
        url={assetUrl(row.assetId ?? '', name)}
        onError={() => setFailed(true)}
        className={cn('h-[50vh] bg-muted/50 p-3', className)}
      />
    )
  }

  const Icon = fileIcons[kind]

  return (
    <div
      className={cn(
        'flex size-full flex-col items-center justify-center gap-2 text-muted-foreground',
        !cover && 'h-40',
        className,
      )}
    >
      {logo && !failed ? (
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="size-10 rounded-md"
        />
      ) : (
        <Icon className="size-9" strokeWidth={1.5} />
      )}
      {!cover ? (
        <span className="text-sm">{kind === 'link' ? hostOf(row.url) : copy.noPreview}</span>
      ) : null}
    </div>
  )
}

// Near-fullscreen view: images fit the viewport, PDFs scroll page by page.
export function Lightbox({
  row,
  open,
  onOpenChange,
}: {
  row: AttachmentRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const name = row.fileName ?? ''
  const id = row.assetId ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[94dvh] w-[96vw] max-w-none gap-0 border-0 bg-black/95 p-0 text-white ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{name}</DialogTitle>
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <HoverAction
            label={copy.download}
            render={<a href={assetUrl(id, name, { download: true })} />}
          >
            <Download />
          </HoverAction>
          <HoverAction label={appCopy.common.close} onClick={() => onOpenChange(false)}>
            <X />
          </HoverAction>
        </div>
        {kindOf(row) === 'image' ? (
          <img
            src={assetUrl(id, name)}
            alt={name}
            draggable={false}
            className="size-full object-contain p-4"
          />
        ) : (
          <PdfViewer url={assetUrl(id, name)} className="size-full rounded-xl p-6 pt-16" />
        )}
      </DialogContent>
    </Dialog>
  )
}
