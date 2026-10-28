import { useState } from 'react'
import { toast } from 'sonner'

import { FormDialog } from '@/components/form/form-dialog'
import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { atsCopy } from '@/modules/ats/ats.copy'
import { lookupRequisitions } from '@/modules/ats/data/candidates'
import { useAddToJob } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.applications

export function AddToJobDialog({
  candidateId,
  candidateName,
  currentJobIds,
  open,
  onOpenChange,
}: {
  candidateId: Uuid
  candidateName: string
  // Jobs they're already on: one application per job.
  currentJobIds: Array<Uuid>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const add = useAddToJob()
  const [job, setJob] = useState<RelationOption | null>(null)
  const [error, setError] = useState<string>()

  function close(next: boolean) {
    if (add.isPending) return
    onOpenChange(next)

    if (!next) {
      setJob(null)
      setError(undefined)
    }
  }

  const search = async (q: string) => {
    const options = await lookupRequisitions(q)

    return options.map((option) =>
      currentJobIds.includes(option.value)
        ? { ...option, description: `${option.description ?? ''} · ${copy.alreadyOn}` }
        : option,
    )
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={copy.addTitle}
      description={copy.addDescription(candidateName)}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()

          if (!job) return

          if (currentJobIds.includes(job.value)) {
            setError(copy.alreadyOn)

            return
          }

          try {
            await add.mutateAsync({ candidateId, requisitionId: job.value })
            toast.success(copy.addedTo(job.label))
            close(false)
          } catch (cause) {
            setError(errorMessage(cause))
          }
        }}
      >
        <RelationCombobox
          id="add-to-job"
          value={job}
          onChange={(option) => {
            setJob(option)
            setError(undefined)
          }}
          search={search}
          placeholder={appCopy.form.searchPlaceholder(atsCopy.candidates.filters.job)}
          searchPlaceholder={appCopy.form.searchPlaceholder(atsCopy.candidates.filters.job)}
          defaultOpen
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" disabled={!job || add.isPending}>
            {add.isPending ? copy.adding : copy.addConfirm}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
