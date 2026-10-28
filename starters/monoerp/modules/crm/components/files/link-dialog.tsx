import { Link2, Loader2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { useId, useState } from 'react'

import { FormDialog } from '@/components/form/form-dialog'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentTarget } from '@/modules/crm/data'
import { useAddLink } from '@/modules/crm/mutations'

const copy = crmCopy.files

// Title and URL for something that lives elsewhere: a Drive folder, a Dropbox file, a contract.
export function AddLinkDialog({
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
