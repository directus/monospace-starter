import { useStore } from '@tanstack/react-form'
import { useState } from 'react'
import { z } from 'zod'

import { useAppForm } from '@/components/form/app-form'
import { DrawerForm, DrawerFormBody, DrawerFormFooter } from '@/components/form/form-drawer'
import { requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import type { OfferDetail } from '@/modules/ats/data/interviews'
import { OFFER_APPROVERS, useSaveOffer, useSubmitOffer } from '@/modules/ats/mutations/interviews'

const copy = atsCopy.interviews.offer

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD']

const currencyOptions = CURRENCIES.map((code) => ({ value: code, label: code }))

const salary = z
  .string()
  .trim()
  .min(1, appCopy.form.required(copy.baseSalary))
  .regex(/^\d{1,15}(\.\d{1,2})?$/, appCopy.form.invalidAmount)

const optionalUnits = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^\d{1,9}$/, appCopy.form.invalidAmount),
])

// The approved band: finance's decision on the role request, else the job's own range.
export function approvedRange(detail: OfferDetail) {
  const job = detail.requisitions
  const request = job?.role_requests
  const min = request?.approvedBaseMin ?? job?.compMin ?? null
  const max = request?.approvedBaseMax ?? job?.compMax ?? null
  const currency = request?.approvedCurrency ?? job?.currency ?? 'USD'

  return { min, max, currency }
}

export function formatRange(range: ReturnType<typeof approvedRange>) {
  if (!range.min && !range.max) return copy.noRange

  return `${formatMoney(range.min, range.currency)} – ${formatMoney(range.max, range.currency)}`
}

export function offerApprovers(detail: OfferDetail) {
  const job = detail.requisitions

  const users: Record<(typeof OFFER_APPROVERS)[number], string | null | undefined> = {
    hiring_manager: job?.hiringManagerUserId,
    department_head: job?.departments?.headUserId,
    vp_operations: null,
    ceo: null,
  }

  return OFFER_APPROVERS.map((role) => ({
    role,
    // SAFETY: these come from uuid user columns on the job and department.
    userId: (users[role] ?? null) as OfferDetail['approvals'][number]['approverUserId'],
  }))
}

// The offer form, shown in OfferDrawer. Read-only facts from the role request and candidate on
// top, then what TA fills in.
export function OfferForm({
  applicationId,
  detail,
  onDone,
  onCancel,
}: {
  applicationId: Uuid
  detail: OfferDetail
  onDone: () => void
  onCancel: () => void
}) {
  const offer = detail.offers
  const range = approvedRange(detail)
  const save = useSaveOffer()
  const submit = useSubmitOffer()
  const [submitError, setSubmitError] = useState<string>()
  const [andSubmit, setAndSubmit] = useState(false)

  const form = useAppForm({
    defaultValues: {
      baseSalary: offer?.baseSalary ? String(Number(offer.baseSalary)) : '',
      currency: offer?.currency ?? range.currency,
      equityUnits: offer?.equityUnits != null ? String(offer.equityUnits) : '',
      proposedStartDate: offer?.proposedStartDate ?? '',
      candidateIntro: offer?.candidateIntro ?? '',
      searchOverview: offer?.searchOverview ?? '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      try {
        const saved = await save.mutateAsync({
          id: offer?.id ?? null,
          applicationId,
          data: {
            baseSalary: value.baseSalary.trim(),
            currency: value.currency,
            equityUnits: value.equityUnits.trim() ? Number(value.equityUnits) : null,
            proposedStartDate: value.proposedStartDate || null,
            candidateIntro: value.candidateIntro.trim() || null,
            searchOverview: value.searchOverview.trim() || null,
          },
        })

        if (andSubmit && saved.id) {
          await submit.mutateAsync({ offerId: saved.id, approvers: offerApprovers(detail) })
        }

        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const base = useStore(form.store, (state) => Number(state.values.baseSalary))

  const outside =
    base > 0 &&
    ((range.min != null && base < Number(range.min)) ||
      (range.max != null && base > Number(range.max)))

  const pending = save.isPending || submit.isPending

  return (
    <DrawerForm form={form}>
      <DrawerFormBody className="space-y-6">
        <OfferPrefilled detail={detail} />

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold">{copy.terms}</legend>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <form.AppField name="baseSalary" validators={{ onBlur: salary, onSubmit: salary }}>
              {(field) => (
                <field.TextField
                  label={copy.baseSalary}
                  inputMode="decimal"
                  placeholder={range.min ? String(Number(range.min)) : '0'}
                  hint={
                    outside ? `${copy.outsideRange}: ${formatRange(range)}` : formatRange(range)
                  }
                  autoFocus
                />
              )}
            </form.AppField>
            <form.AppField name="currency">
              {(field) => <field.SelectField label={copy.currency} options={currencyOptions} />}
            </form.AppField>
            <form.AppField
              name="equityUnits"
              validators={{ onBlur: optionalUnits, onSubmit: optionalUnits }}
            >
              {(field) => <field.TextField label={copy.equity} optional inputMode="numeric" />}
            </form.AppField>
            <form.AppField
              name="proposedStartDate"
              validators={{ onSubmit: requiredText(copy.startDate) }}
            >
              {(field) => <field.TextField label={copy.startDate} type="date" />}
            </form.AppField>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold">{copy.context}</legend>
          <form.AppField name="candidateIntro">
            {(field) => (
              <field.TextareaField
                label={copy.intro}
                rows={4}
                placeholder={copy.introPlaceholder}
              />
            )}
          </form.AppField>
          <form.AppField name="searchOverview">
            {(field) => (
              <field.TextareaField
                label={copy.overview}
                rows={4}
                placeholder={copy.overviewPlaceholder}
              />
            )}
          </form.AppField>
        </fieldset>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onCancel}>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          onClick={() => setAndSubmit(false)}
        >
          {pending && !andSubmit ? appCopy.form.saving : copy.save}
        </Button>
        <Button type="submit" disabled={pending} onClick={() => setAndSubmit(true)}>
          {pending && andSubmit ? appCopy.form.saving : copy.submitForApproval}
        </Button>
      </DrawerFormFooter>
    </DrawerForm>
  )
}

// What the offer copies from the role request and the candidate. Read-only here: change it at
// the source.
export function OfferPrefilled({ detail }: { detail: OfferDetail }) {
  const job = detail.requisitions
  const range = approvedRange(detail)

  return (
    <div className="grid gap-3">
      <Prefilled
        title={copy.fromRequisition}
        rows={[
          [copy.department, job?.departments?.name],
          [copy.jobTitle, job?.title],
          [copy.level, job?.job_levels?.name],
          [copy.employmentType, optionLabel('employmentType', job?.employmentType)],
          [copy.approvedRange, formatRange(range)],
        ]}
      />
      <Prefilled
        title={copy.fromCandidate}
        rows={[
          [copy.firstName, detail.candidates?.firstName],
          [copy.lastName, detail.candidates?.lastName],
          [copy.city, detail.candidates?.city],
          [copy.country, detail.candidates?.country],
        ]}
      />
    </div>
  )
}

function Prefilled({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string | null | undefined]>
}) {
  return (
    <section className="rounded-lg border bg-muted/40 p-3">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="grid grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value || appCopy.fallback.none}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
