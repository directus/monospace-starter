import { useQuery } from '@tanstack/react-query'
import { FileText, Link2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading } from '@/components/data-state'
import { FormDialog } from '@/components/form/form-dialog'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { assetUrl } from '@/lib/assets'
import { errorMessage } from '@/lib/errors'
import { atsCopy } from '@/modules/ats/ats.copy'
import { optionalUrl } from '@/modules/ats/components/candidates/candidate-form'
import { candidateFilesQuery } from '@/modules/ats/data/candidates'
import type { CandidateFile } from '@/modules/ats/data/candidates'
import {
  useAddCandidateLink,
  useDeleteCandidateFile,
  useUploadCandidateFile,
} from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.files

type Kind = 'resume' | 'other'

function hostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function fileHref(file: CandidateFile) {
  return file.assetId ? assetUrl(file.assetId, file.fileName ?? 'file') : (file.url ?? undefined)
}

// Resume and other attachments: uploads go to Monospace storage, links point elsewhere (a
// LinkedIn PDF, a portfolio). The first file added is the resume.
export function FilesPanel({ candidateId }: { candidateId: Uuid }) {
  const files = useQuery(candidateFilesQuery(candidateId))
  const upload = useUploadCandidateFile()
  const remove = useDeleteCandidateFile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [linking, setLinking] = useState(false)
  const [deleting, setDeleting] = useState<CandidateFile>()
  const hasResume = files.data?.some((file) => file.kind === 'resume') ?? false
  const nextKind: Kind = hasResume ? 'other' : 'resume'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload data-icon="inline-start" />
          {copy.upload}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLinking(true)}>
          <Link2 data-icon="inline-start" />
          {copy.addLink}
        </Button>
        {upload.isPending ? (
          <span className="text-sm text-muted-foreground">
            {copy.uploading(upload.variables.file.name)}
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.rtf,.png,.jpg,.jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''

            if (file) upload.mutate({ candidateId, file, kind: nextKind })
          }}
        />
      </div>

      {files.isPending ? <DataLoading rows={2} /> : null}
      {files.isError ? <DataError error={files.error} /> : null}
      {files.data?.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Paperclip className="size-6 text-muted-foreground" />
          <p className="font-medium">{copy.empty}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{copy.emptyHint}</p>
        </div>
      ) : null}
      {files.data?.length ? (
        <ul className="divide-y rounded-xl border">
          {files.data.map((file) => (
            <li key={file.id} className="group/file flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {file.assetId ? <FileText className="size-4" /> : <Link2 className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={fileHref(file)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {file.fileName}
                </a>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {file.createdBy ? <span>{userName(file.createdBy)} ·</span> : null}
                  <RelativeTime value={file.createdAt} />
                  {file.url && !file.assetId ? (
                    <span className="truncate">· {hostname(file.url)}</span>
                  ) : null}
                </p>
              </div>
              <Badge variant={file.kind === 'resume' ? 'secondary' : 'outline'}>
                {copy.kindLabel[file.kind === 'resume' ? 'resume' : 'other']}
              </Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  remove.reset()
                  setDeleting(file)
                }}
              >
                <Trash2 />
                <span className="sr-only">{copy.deleteTitle}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <AddLinkDialog
        candidateId={candidateId}
        defaultKind={nextKind}
        open={linking}
        onOpenChange={setLinking}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={copy.deleteTitle}
        description={appCopy.confirm.deleteDescription(deleting?.fileName ?? '')}
        confirmLabel={appCopy.common.delete}
        pendingLabel={appCopy.confirm.deleting}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() =>
          deleting &&
          remove.mutate(
            { id: deleting.id, assetId: deleting.assetId },
            { onSuccess: () => setDeleting(undefined) },
          )
        }
      />
    </div>
  )
}

function AddLinkDialog({
  candidateId,
  defaultKind,
  open,
  onOpenChange,
}: {
  candidateId: Uuid
  defaultKind: Kind
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const add = useAddCandidateLink()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<Kind>(defaultKind)
  const [error, setError] = useState<string>()

  function close(next: boolean) {
    if (add.isPending) return
    onOpenChange(next)

    if (!next) {
      setName('')
      setUrl('')
      setError(undefined)
    } else setKind(defaultKind)
  }

  return (
    <FormDialog open={open} onOpenChange={close} title={copy.linkTitle}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const link = optionalUrl.safeParse(url.trim())

          if (!url.trim() || !link.success) {
            setError(link.error?.issues[0]?.message ?? copy.invalidUrl)

            return
          }

          try {
            await add.mutateAsync({
              candidateId,
              url: url.trim(),
              fileName: name.trim() || hostname(url.trim()),
              kind,
            })
            close(false)
          } catch (cause) {
            setError(errorMessage(cause))
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="candidate-link-url">{copy.linkUrl}</Label>
          <Input
            id="candidate-link-url"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://"
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="candidate-link-name">{copy.linkName}</Label>
          <Input
            id="candidate-link-name"
            value={name}
            placeholder={copy.linkNamePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{copy.linkKind}</Label>
          <div className="flex gap-1.5">
            {(['resume', 'other'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={kind === value ? 'default' : 'outline'}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {copy.kindLabel[value]}
              </Button>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? copy.linkSaving : copy.linkSave}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
