import { useState } from 'react'
import { z } from 'zod'

import { useAppForm } from '@/components/form/app-form'
import { FormDialog } from '@/components/form/form-dialog'
import { requiredEmail, requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { atsCopy } from '@/modules/ats/ats.copy'
import type { OpenRole } from '@/modules/ats/data/home'
import { useReferCandidate } from '@/modules/ats/mutations/home'

const copy = atsCopy.home.openRoles.form

const optionalUrl = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+\.\S+/i, copy.invalidUrl),
])

export function ReferralDialog({
  role,
  onOpenChange,
}: {
  role: OpenRole | undefined
  onOpenChange: (open: boolean) => void
}) {
  return (
    <FormDialog
      open={Boolean(role)}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={role ? copy.description(role.title ?? '') : undefined}
      className="sm:max-w-lg"
    >
      {role ? <ReferralForm key={role.id} role={role} onDone={() => onOpenChange(false)} /> : null}
    </FormDialog>
  )
}

function ReferralForm({ role, onDone }: { role: OpenRole; onDone: () => void }) {
  const user = useCurrentUser()
  const refer = useReferCandidate()
  const [submitError, setSubmitError] = useState<string>()

  const form = useAppForm({
    defaultValues: { firstName: '', lastName: '', email: '', linkedinUrl: '', why: '' },
    onSubmit: async ({ value }) => {
      if (!user) return
      setSubmitError(undefined)

      try {
        await refer.mutateAsync({ ...value, role, referrerUserId: user.id })
        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField
          name="firstName"
          validators={{
            onBlur: requiredText(copy.firstName),
            onSubmit: requiredText(copy.firstName),
          }}
        >
          {(field) => <field.TextField label={copy.firstName} autoFocus autoComplete="off" />}
        </form.AppField>
        <form.AppField
          name="lastName"
          validators={{
            onBlur: requiredText(copy.lastName),
            onSubmit: requiredText(copy.lastName),
          }}
        >
          {(field) => <field.TextField label={copy.lastName} autoComplete="off" />}
        </form.AppField>
        <form.AppField
          name="email"
          validators={{ onBlur: requiredEmail(copy.email), onSubmit: requiredEmail(copy.email) }}
        >
          {(field) => (
            <field.TextField
              label={copy.email}
              type="email"
              autoComplete="off"
              className="sm:col-span-2"
            />
          )}
        </form.AppField>
        <form.AppField
          name="linkedinUrl"
          validators={{ onBlur: optionalUrl, onSubmit: optionalUrl }}
        >
          {(field) => (
            <field.TextField
              label={copy.linkedin}
              optional
              inputMode="url"
              placeholder={copy.linkedinPlaceholder}
              autoComplete="off"
              autoCapitalize="none"
              className="sm:col-span-2"
            />
          )}
        </form.AppField>
        <form.AppField
          name="why"
          validators={{ onBlur: requiredText(copy.why), onSubmit: requiredText(copy.why) }}
        >
          {(field) => (
            <field.TextareaField
              label={copy.why}
              hint={copy.whyHint}
              rows={4}
              className="sm:col-span-2"
            />
          )}
        </form.AppField>
      </div>
      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {appCopy.common.cancel}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={copy.submit} pendingLabel={copy.submitting} />
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
