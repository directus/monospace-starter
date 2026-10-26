import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Download,
  Copy,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  Loader2,
  Maximize2,
  Paperclip,
  Presentation,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, ReactElement, ReactNode } from 'react'
import { toast } from 'sonner'

import { DeleteDialog } from '@/components/confirm-dialog'
import { DrawerFormBody, FormDrawer } from '@/components/form/form-drawer'
import { FormDialog } from '@/components/form/form-dialog'
import { PdfViewer } from '@/components/pdf-viewer'
import { Property, PropertyList } from '@/components/inline/inline-field'
import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { assetUrl, fetchUploadLimit, formatBytes } from '@/lib/assets'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LinkedRecord } from '@/modules/crm/components/activity-row'
import { activityIcons } from '@/modules/crm/components/activity-form'
import { contactName } from '@/modules/crm/components/entities'
import { crmCopy } from '@/modules/crm/crm.copy'
import { attachmentsQuery } from '@/modules/crm/data'
import type { AttachmentRow, AttachmentScope, AttachmentTarget } from '@/modules/crm/data'
import { organizationLogo } from '@/modules/crm/entity-options'
import { ContactIcon, DealIcon, OrganizationIcon } from '@/modules/crm/icons'
import { useAddLink, useDeleteAttachment, useUploadAttachment } from '@/modules/crm/mutations'

const copy = crmCopy.files

type Upload = { key: string; file: File; progress: number; failed: boolean }

type Hide = ReadonlyArray<LinkedRecord | 'activity'>

// Files picked from anywhere (drop zone, Upload button, header menu) go through here: a size
// check against the server cap, then one upload at a time so progress reads left to right.
function useUploads({ notify = false } = {}) {
  const { mutateAsync } = useUploadAttachment({ notify })
  const [uploads, setUploads] = useState<Array<Upload>>([])
  const limit = useRef<number | null>(null)
  useEffect(() => {
    void fetchUploadLimit().then((value) => {
      limit.current = value
    })
  }, [])

  const patch = (key: string, next: Partial<Upload>) =>
    setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...next } : item)))

  const add = useCallback(
    async (files: Iterable<File>, target: AttachmentTarget) => {
      for (const file of files) {
        if (limit.current && file.size > limit.current) {
          toast.error(copy.tooLarge(file.name, formatBytes(limit.current)))
          continue
        }

        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
        setUploads((current) => [...current, { key, file, progress: 0, failed: false }])

        try {
          await mutateAsync({
            file,
            target,
            onProgress: (fraction) => patch(key, { progress: fraction }),
          })
          setUploads((current) => current.filter((item) => item.key !== key))
        } catch {
          patch(key, { failed: true })
        }
      }
    },
    [mutateAsync],
  )

  const dismiss = (key: string) =>
    setUploads((current) => current.filter((item) => item.key !== key))

  return { uploads, add, dismiss }
}

// A hidden file input plus a way to open it, for menu items and buttons outside the panel.
export function useFilePicker(onFiles: (files: Iterable<File>) => void) {
  const ref = useRef<HTMLInputElement>(null)

  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      className="hidden"
      tabIndex={-1}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files?.length) onFiles(Array.from(event.target.files))
        event.target.value = ''
      }}
    />
  )

  return { input, pick: () => ref.current?.click() }
}

// For record headers: an "Attach file" action that uploads straight to the record. The target
// is passed at pick time so the hook can sit above a page's loading returns.
export function useAttachFiles() {
  const { add } = useUploads({ notify: true })
  const pending = useRef<AttachmentTarget | null>(null)

  const picker = useFilePicker((files) => {
    if (pending.current) void add(files, pending.current)
  })

  return {
    input: picker.input,
    pick: (target: AttachmentTarget) => {
      pending.current = target
      picker.pick()
    },
  }
}

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
  const rows = useQuery(attachmentsQuery(scope))
  const { uploads, add, dismiss } = useUploads()
  const picker = useFilePicker((files) => target && add(files, target))
  const [dragging, setDragging] = useState(false)
  const [linking, setLinking] = useState(false)
  const items = rows.data ?? []
  const empty = !rows.isPending && items.length === 0 && uploads.length === 0

  // Only files coming from outside the page. Dialogs render in portals but their React events
  // still bubble here, and dragging a preview image would otherwise re-upload it.
  const external = (event: DragEvent) =>
    Boolean(target) &&
    event.target instanceof Node &&
    event.currentTarget.contains(event.target) &&
    event.dataTransfer.types.includes('Files') &&
    !event.dataTransfer.types.includes('text/uri-list')

  const onDrop = (event: DragEvent) => {
    if (!external(event)) return
    event.preventDefault()
    setDragging(false)

    if (target && event.dataTransfer.files.length) {
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
      {target ? <AddLinkDialog open={linking} onOpenChange={setLinking} target={target} /> : null}
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 text-sm font-medium backdrop-blur-xs">
          <Upload className="mr-2 size-4" />
          {copy.dropActive}
        </div>
      ) : null}
      {variant === 'card' && target ? (
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
      {variant === 'inline' && target ? <div className="mt-3 flex gap-2">{actions}</div> : null}
    </div>
  )
}

const tileClass =
  'relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted/40 text-left outline-none'

function UploadCard({ upload, onDismiss }: { upload: Upload; onDismiss: () => void }) {
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

const surfaceClass =
  'absolute inset-0 size-full cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

function FileCard({ row, hide }: { row: AttachmentRow; hide: Hide }) {
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
        <FileActions row={row} onExpand={() => setExpanded(true)} onDelete={askDelete} />
      </div>
      {kind !== 'link' ? (
        <>
          <FileDrawer
            row={row}
            hide={hide}
            open={viewing}
            onOpenChange={setViewing}
            onExpand={() => setExpanded(true)}
            onDelete={askDelete}
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
function FileActions({
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

function HoverAction({
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

// What an attachment looks like: the image itself, the site logo for a link, or a type icon.
// `cover` fills a tile; otherwise PDFs render page by page.
function FilePreview({
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
function Lightbox({
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

// Title and URL for something that lives elsewhere: a Drive folder, a Dropbox file, a contract.
function AddLinkDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: AttachmentTarget
}) {
  const add = useAddLink()
  const isMobile = useIsMobile()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const titleId = useId()
  const urlId = useId()

  const close = (next: boolean) => {
    if (!next) {
      setTitle('')
      setUrl('')
      setError(undefined)
      add.reset()
    }

    onOpenChange(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    let parsed: URL

    try {
      parsed = new URL(url.trim())

      if (!/^https?:$/.test(parsed.protocol)) throw new Error()
    } catch {
      setError(copy.invalidUrl)

      return
    }

    add.mutate(
      { title: title.trim() || parsed.hostname, url: parsed.toString(), target },
      { onSuccess: () => close(false) },
    )
  }

  return (
    <FormDialog open={open} onOpenChange={close} title={copy.addLink} description={copy.linkHint}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={urlId}>{copy.linkUrl}</Label>
            <Input
              id={urlId}
              type="url"
              inputMode="url"
              autoFocus={!isMobile}
              placeholder="https://"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                setError(undefined)
              }}
              aria-invalid={Boolean(error)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={titleId}>
              {copy.linkTitle}{' '}
              <span className="font-normal text-muted-foreground">
                ({appCopy.common.optional.toLowerCase()})
              </span>
            </Label>
            <Input
              id={titleId}
              placeholder={copy.linkTitlePlaceholder}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {error || add.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {error ?? errorMessage(add.error)}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" disabled={add.isPending || !url.trim()}>
            {add.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {copy.addLink}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}

// One attachment: preview with floating actions, then the metadata and what it is attached to.
function FileDrawer({
  row,
  hide,
  open,
  onOpenChange,
  onExpand,
  onDelete,
}: {
  row: AttachmentRow
  hide: Hide
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpand: () => void
  onDelete: () => void
}) {
  const name = row.fileName ?? ''
  const kind = kindOf(row)
  const uploader = row.createdBy?.fullName ?? row.createdBy?.email

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={name}
      description={
        kind === 'link'
          ? (row.url ?? undefined)
          : [row.contentType, formatBytes(row.sizeBytes)].filter(Boolean).join(' · ')
      }
      actions={<RecordMenu size="icon-sm" variant="ghost" onDelete={onDelete} />}
    >
      <DrawerFormBody>
        <div className="group/preview relative overflow-hidden rounded-lg border bg-muted/30">
          <FilePreview row={row} />
          <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 transition-opacity group-focus-within/preview:opacity-100 group-hover/preview:opacity-100 [@media(hover:hover)]:opacity-0">
            <FileActions row={row} onExpand={onExpand} />
          </div>
        </div>
        <PropertyList className="grid grid-cols-2 gap-4 space-y-0">
          {kind === 'link' ? (
            <Property label={copy.linkUrl}>
              <a
                href={row.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="break-all hover:underline"
              >
                {row.url}
              </a>
            </Property>
          ) : (
            <>
              <Property label={copy.type}>{row.contentType ?? '—'}</Property>
              <Property label={copy.size}>{formatBytes(row.sizeBytes) || '—'}</Property>
            </>
          )}
          <Property label={copy.uploadedBy}>{uploader ?? '—'}</Property>
          <Property label={copy.uploadedAt}>{formatDateTime(row.createdAt)}</Property>
        </PropertyList>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {copy.linked}
          </h3>
          <div className="space-y-1 text-sm [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_a]:py-1 [&_a]:hover:underline [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
            {row.interactions?.id && !hide.includes('activity') ? (
              <div className="flex items-center gap-2.5 py-1">
                <ActivityTypeIcon type={row.interactions.type} />
                <span className="truncate">
                  {row.interactions.subject ?? crmCopy.activity.untitled}
                </span>
              </div>
            ) : null}
            {row.opportunities?.id && !hide.includes('deal') ? (
              <Link to="/crm/deals/$dealId" params={{ dealId: row.opportunities.id }}>
                <DealIcon />
                <span className="truncate">
                  {row.opportunities.title ?? crmCopy.deals.restricted}
                </span>
              </Link>
            ) : null}
            {row.contacts?.id && !hide.includes('contact') ? (
              <Link to="/crm/contacts/$contactId" params={{ contactId: row.contacts.id }}>
                <ContactIcon />
                <span className="truncate">{contactName(row.contacts) ?? ''}</span>
              </Link>
            ) : null}
            {row.organizations?.id && !hide.includes('organization') ? (
              <Link
                to="/crm/organizations/$organizationId"
                params={{ organizationId: row.organizations.id }}
              >
                <OrganizationIcon />
                <span className="truncate">
                  {row.organizations.name ?? crmCopy.organizations.restricted}
                </span>
              </Link>
            ) : null}
          </div>
        </section>
      </DrawerFormBody>
    </FormDrawer>
  )
}

function ActivityTypeIcon({ type }: { type: string | null | undefined }) {
  const Icon = activityIcons[type ?? 'note'] ?? Paperclip

  return <Icon />
}

// Where the file sits below the organization: the activity it was attached to, else the deal,
// else the contact. Skips whatever the page already is.
function ContextPill({ row, hide }: { row: AttachmentRow; hide: Hide }) {
  let content: ReactNode = null

  if (row.interactions?.id && !hide.includes('activity')) {
    content = (
      <>
        <ActivityTypeIcon type={row.interactions.type} />
        <span className="truncate">{row.interactions.subject ?? crmCopy.activity.untitled}</span>
      </>
    )
  } else if (row.opportunities?.id && !hide.includes('deal')) {
    content = (
      <>
        <DealIcon />
        <span className="truncate">{row.opportunities.title ?? crmCopy.deals.restricted}</span>
      </>
    )
  } else if (row.contacts?.id && !hide.includes('contact')) {
    content = (
      <>
        <ContactIcon />
        <span className="truncate">{contactName(row.contacts) ?? ''}</span>
      </>
    )
  }

  if (!content) return null

  return (
    <Badge
      variant="secondary"
      className="max-w-44 min-w-0 gap-1 bg-white/90 px-1.5 font-normal text-neutral-900 shadow-sm backdrop-blur-sm [&_svg]:size-3"
    >
      {content}
    </Badge>
  )
}

const fileIcons = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  link: Link2,
  other: File,
}

function kindOf(row: { contentType?: string | null; url?: string | null }): keyof typeof fileIcons {
  if (row.url) return 'link'
  const type = row.contentType ?? ''

  if (type.startsWith('image/')) return 'image'

  if (type.startsWith('video/')) return 'video'

  if (type.startsWith('audio/')) return 'audio'

  if (type === 'application/pdf') return 'pdf'

  if (type.includes('sheet') || type.includes('excel') || type === 'text/csv') return 'sheet'

  if (type.includes('presentation') || type.includes('powerpoint')) return 'slides'

  if (type.startsWith('text/') || type.includes('document')) return 'text'

  if (type.includes('zip') || type.includes('compressed') || type.includes('tar')) return 'archive'

  return 'other'
}

function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}
