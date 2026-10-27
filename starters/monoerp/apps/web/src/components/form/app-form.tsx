import { createFormHook } from '@tanstack/react-form'
import type { AnyFormApi } from '@tanstack/react-form'
import { z } from 'zod'

import { fieldContext, formContext, useFormContext } from '@/components/form/contexts'
import {
  CheckboxField,
  RelationField,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'

export async function submitForm(
  form: Pick<AnyFormApi, 'setErrorMap'>,
  submit: () => Promise<void>,
) {
  form.setErrorMap({ onSubmit: undefined })

  try {
    await submit()
  } catch (error) {
    form.setErrorMap({ onSubmit: { form: errorMessage(error), fields: {} } })
  }
}

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

function FormError() {
  const form = useFormContext()

  return (
    <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
      {(error) => z.string().safeParse(error).data ?? null}
    </form.Subscribe>
  )
}

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextareaField, SelectField, CheckboxField, RelationField },
  formComponents: { SubmitButton, FormError },
})
