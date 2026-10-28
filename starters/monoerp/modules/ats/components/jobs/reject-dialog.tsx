import { useState } from 'react'

import { FormDialog } from '@/components/form/form-dialog'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.jobs.reject

// rejection_reason is varchar(200): the picked reason, then any detail.
const REASON_MAX = 200

export function RejectDialog({
  name,
  open,
  onOpenChange,
  onReject,
}: {
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onReject: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState<string>()
  const [detail, setDetail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  const close = (next: boolean) => {
    if (pending) return
    onOpenChange(next)

    if (!next) {
      setReason(undefined)
      setDetail('')
      setError(undefined)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={copy.title(name)}
      description={copy.description}
      className="sm:max-w-lg"
    >
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault()

          if (!reason) return
          const text = [reason, detail.trim()].filter(Boolean).join(': ').slice(0, REASON_MAX)
          setPending(true)
          setError(undefined)

          try {
            await onReject(text)
            setPending(false)
            close(false)
          } catch (cause) {
            setPending(false)
            setError(errorMessage(cause, copy.failed))
          }
        }}
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{copy.reason}</legend>
          <div className="flex flex-wrap gap-1.5">
            {copy.reasons.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={reason === option}
                onClick={() => setReason(option)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2',
                  reason === option &&
                    'border-foreground bg-foreground text-background hover:bg-foreground/90',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="reject-detail">{copy.detail}</Label>
          <Textarea
            id="reject-detail"
            value={detail}
            maxLength={REASON_MAX - (reason?.length ?? 0) - 2}
            placeholder={copy.detailPlaceholder}
            onChange={(event) => setDetail(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" variant="destructive" disabled={!reason || pending}>
            {pending ? copy.pending : copy.confirm}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
