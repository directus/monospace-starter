import { Copy, Download, Maximize2, Trash2 } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { appCopy } from '@/lib/app.copy'
import { assetUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentRow } from '@/modules/crm/data'

import { kindOf } from './file-kind'

const copy = crmCopy.files

export function FileActions({
  row,
  onExpand,
  onDelete,
}: {
  row: AttachmentRow
  onExpand: () => void
  onDelete?: () => void
}) {
  const kind = kindOf(row)
  const name = row.fileName ?? ''
  const id = row.assetId ?? ''

  return (
    <>
      {kind === 'link' ? (
        <HoverAction label={copy.copyLink} onClick={() => copyLink(row.url ?? '')}>
          <Copy />
        </HoverAction>
      ) : null}
      {kind === 'image' || kind === 'pdf' ? (
        <HoverAction label={copy.fullScreen} onClick={onExpand}>
          <Maximize2 />
        </HoverAction>
      ) : null}
      {kind !== 'link' ? (
        <HoverAction
          label={copy.download}
          render={<a href={assetUrl(id, name, { download: true })} />}
        >
          <Download />
        </HoverAction>
      ) : null}
      {onDelete ? (
        <HoverAction label={appCopy.common.delete} onClick={onDelete} destructive>
          <Trash2 />
        </HoverAction>
      ) : null}
    </>
  )
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success(copy.linkCopied)
  } catch {
    toast.error(copy.copyFailed)
  }
}

export function HoverAction({
  label,
  onClick,
  render,
  destructive,
  children,
}: {
  label: string
  onClick?: () => void
  render?: ReactElement
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            aria-label={label}
            onClick={onClick}
            render={render}
            nativeButton={!render}
            className={cn(
              'pointer-events-auto size-8 rounded-full bg-white/90 shadow-md backdrop-blur-sm hover:bg-white pointer-coarse:size-9 [&_svg]:size-4',
              destructive ? 'text-destructive' : 'text-neutral-900',
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
