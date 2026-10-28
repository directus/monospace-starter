import { useState } from 'react'
import { z } from 'zod'

import { useAppForm } from '@/components/form/app-form'
import { optionalPhone, requiredEmail, requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { errorMessage } from '@/lib/errors'
import { atsCopy } from '@/modules/ats/ats.copy'
import { PrivacyNotice } from '@/modules/ats/components/careers/privacy-notice'
import type { CareerJob } from '@/modules/ats/data/careers'
import { useSubmitApplication } from '@/modules/ats/mutations/careers'

const copy = atsCopy.careers.form

const optionalUrl = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+\.\S+/i, copy.invalidUrl),
])

const answers = [
  { value: 'yes', label: copy.yes },
  { value: 'no', label: copy.no },
  { value: 'skip', label: copy.skip },
]

function answer(value: string) {
  return value === 'yes' ? true : value === 'no' ? false : null
}

const blank = (value: string) => value.trim() || null

export function ApplyForm({
  job,
  onSubmitted,
}: {
  job: CareerJob
  onSubmitted: (firstName: string) => void
}) {
  const submit = useSubmitApplication()
  const [submitError, setSubmitError] = useState<string>()

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      city: '',
      country: '',
      workAuthorized: '',
      needsSponsorship: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      resumeUrl: '',
      consent: false,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      if (!value.consent) return

      const resumeUrl = blank(value.resumeUrl)

      try {
        await submit.mutateAsync({
          jobId: job.id,
          consent: true,
          firstName: value.firstName.trim(),
          lastName: value.lastName.trim(),
          email: value.email.trim(),
          phone: blank(value.phone),
          city: blank(value.city),
          country: blank(value.country),
          workAuthorized: answer(value.workAuthorized),
          needsSponsorship: answer(value.needsSponsorship),
          linkedinUrl: blank(value.linkedinUrl),
          githubUrl: blank(value.githubUrl),
          portfolioUrl: blank(value.portfolioUrl),
          resumeUrl,
          resumeFileName: resumeUrl ? copy.resumeFileName : null,
        })
        onSubmitted(value.firstName.trim())
      } catch (error) {
        setSubmitError(errorMessage(error, copy.failed))
      }
    },
  })

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <FieldSet>
        <FieldLegend className="text-base font-semibold">{copy.you}</FieldLegend>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="firstName"
            validators={{
              onBlur: requiredText(copy.firstName),
              onSubmit: requiredText(copy.firstName),
            }}
          >
            {(field) => <field.TextField label={copy.firstName} autoComplete="given-name" />}
          </form.AppField>
          <form.AppField
            name="lastName"
            validators={{
              onBlur: requiredText(copy.lastName),
              onSubmit: requiredText(copy.lastName),
            }}
          >
            {(field) => <field.TextField label={copy.lastName} autoComplete="family-name" />}
          </form.AppField>
          <form.AppField
            name="email"
            validators={{ onBlur: requiredEmail(copy.email), onSubmit: requiredEmail(copy.email) }}
          >
            {(field) => <field.TextField label={copy.email} type="email" autoComplete="email" />}
          </form.AppField>
          <form.AppField
            name="phone"
            validators={{ onBlur: optionalPhone, onSubmit: optionalPhone }}
          >
            {(field) => (
              <field.TextField label={copy.phone} type="tel" optional autoComplete="tel" />
            )}
          </form.AppField>
          <form.AppField name="city">
            {(field) => (
              <field.TextField label={copy.city} optional autoComplete="address-level2" />
            )}
          </form.AppField>
          <form.AppField name="country">
            {(field) => (
              <field.TextField label={copy.country} optional autoComplete="country-name" />
            )}
          </form.AppField>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend className="text-base font-semibold">{copy.eligibility}</FieldLegend>
        <div className="grid gap-4">
          <form.AppField name="workAuthorized">
            {(field) => (
              <field.SelectField
                label={copy.workAuthorized}
                optional
                options={answers}
                placeholder={copy.skip}
              />
            )}
          </form.AppField>
          <form.AppField name="needsSponsorship">
            {(field) => (
              <field.SelectField
                label={copy.needsSponsorship}
                optional
                options={answers}
                placeholder={copy.skip}
              />
            )}
          </form.AppField>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend className="text-base font-semibold">{copy.links}</FieldLegend>
        <p className="-mt-1 text-sm text-muted-foreground">{copy.linksHint}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="resumeUrl"
            validators={{ onBlur: optionalUrl, onSubmit: optionalUrl }}
          >
            {(field) => (
              <field.TextField
                label={copy.resume}
                hint={copy.resumeHint}
                optional
                inputMode="url"
                placeholder="https://"
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          {(
            [
              ['linkedinUrl', copy.linkedin, 'https://linkedin.com/in/…'],
              ['githubUrl', copy.github, 'https://github.com/…'],
              ['portfolioUrl', copy.portfolio, 'https://'],
            ] as const
          ).map(([name, label, placeholder]) => (
            <form.AppField
              key={name}
              name={name}
              validators={{ onBlur: optionalUrl, onSubmit: optionalUrl }}
            >
              {(field) => (
                <field.TextField
                  label={label}
                  optional
                  inputMode="url"
                  autoCapitalize="none"
                  placeholder={placeholder}
                  className={name === 'portfolioUrl' ? 'sm:col-span-2' : undefined}
                />
              )}
            </form.AppField>
          ))}
        </div>
      </FieldSet>

      <div className="space-y-4">
        <PrivacyNotice />
        <form.AppField
          name="consent"
          validators={{
            onChange: ({ value }) => (value ? undefined : copy.consentRequired),
            onSubmit: ({ value }) => (value ? undefined : copy.consentRequired),
          }}
        >
          {(field) => (
            <div className="space-y-1.5">
              <field.CheckboxField label={copy.consent} />
              {field.state.meta.errors.length ? (
                <p role="alert" className="text-sm text-destructive">
                  {copy.consentRequired}
                </p>
              ) : null}
            </div>
          )}
        </form.AppField>
      </div>

      {submitError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="h-11 w-full bg-(--brand) px-6 text-white hover:bg-(--brand)/90 sm:w-auto"
          >
            {isSubmitting ? copy.submitting : copy.submit}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
