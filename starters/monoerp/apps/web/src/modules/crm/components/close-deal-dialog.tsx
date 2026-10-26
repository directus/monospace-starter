import { useAppForm } from '@/components/form/app-form'
import { FormDialog } from '@/components/form/form-dialog'
import { requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { appCopy } from '@/lib/app.copy'
import { todayInput, toDateInput } from '@/lib/dates'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { PipelineStage } from '@/modules/crm/data'

const copy = crmCopy.deals.close

type CloseDealValues = {
  valueAmount: string
  closeDate: string
  notes: string
}

export function CloseDealDialog({
  stage,
  valueAmount,
  currency,
  expectedCloseDate,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  stage: PipelineStage | undefined
  valueAmount: string | null | undefined
  currency: string
  expectedCloseDate: string | null | undefined
  pending: boolean
  error?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (value: {
    valueAmount: string | null
    closeDate: string
    notes: string
  }) => void | Promise<void>
}) {
  const form = useAppForm({
    defaultValues: {
      valueAmount: valueAmount ?? '',
      closeDate: toDateInput(expectedCloseDate) || todayInput(),
      notes: '',
    } satisfies CloseDealValues,
    onSubmit: async ({ value }) => {
      try {
        await onConfirm({
          valueAmount: value.valueAmount.trim() || null,
          closeDate: value.closeDate,
          notes: value.notes.trim(),
        })
      } catch {
        // The mutation owns the error state rendered below.
      }
    },
  })

  return (
    <FormDialog
      open={Boolean(stage)}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={copy.title(stage?.name ?? '')}
      showCloseButton={false}
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.AppField name="valueAmount">
          {(field) => (
            <field.TextField
              label={`${copy.finalValue} (${currency})`}
              inputMode="decimal"
              autoFocus
              disabled={pending}
            />
          )}
        </form.AppField>
        <form.AppField
          name="closeDate"
          validators={{
            onBlur: requiredText(copy.closeDate),
            onSubmit: requiredText(copy.closeDate),
          }}
        >
          {(field) => <field.TextField label={copy.closeDate} type="date" disabled={pending} />}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => (
            <field.TextareaField
              label={stage?.isWon ? copy.winNotes : copy.lossNotes}
              optional
              placeholder={stage?.isWon ? copy.winNotesPlaceholder : copy.lossNotesPlaceholder}
              className="sm:col-span-2 [&_textarea]:min-h-24"
              disabled={pending}
            />
          )}
        </form.AppField>
        {error ? (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter className="sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {appCopy.common.cancel}
          </Button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                variant={stage?.isWon ? 'default' : 'destructive'}
                disabled={!canSubmit || pending || isSubmitting}
              >
                {pending || isSubmitting
                  ? appCopy.form.saving
                  : stage?.isWon
                    ? crmCopy.deals.stepper.markWon
                    : crmCopy.deals.stepper.markLost}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
