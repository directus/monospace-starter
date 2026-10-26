import { createFormHook } from '@tanstack/react-form'

import { Button } from '@/components/ui/button'
import { fieldContext, formContext, useFormContext } from '@/components/form/contexts'
import {
  CheckboxField,
  RelationField,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/form/fields'

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <Button type="submit" disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? pendingLabel : label}
        </Button>
      )}
    </form.Subscribe>
  )
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, RelationField },
  formComponents: { SubmitButton },
})
