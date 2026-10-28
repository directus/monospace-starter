import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Info, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { optionalPhone, requiredEmail, requiredText } from '@/components/form/validators'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { lookupUsers } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  candidateName,
  joinTags,
  splitTags,
} from '@/modules/ats/components/candidates/candidate-labels'
import {
  findCandidateByEmail,
  lookupRequisitions,
  resolveRequisitions,
} from '@/modules/ats/data/candidates'
import { useCreateCandidate } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.form

export const optionalUrl = z.union([
  z.literal(''),
  z.string().trim().url(copy.invalidUrl).startsWith('http', copy.invalidUrl),
])

const sourceOptions = Object.entries(atsCopy.options.source).map(([value, label]) => ({
  value,
  label,
}))

const triStateOptions = [
  { value: 'unknown', label: copy.unknown },
  { value: 'yes', label: copy.yes },
  { value: 'no', label: copy.no },
]

function triState(value: string) {
  return value === 'yes' ? true : value === 'no' ? false : null
}

type CandidateValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  city: string
  country: string
  workAuthorized: string
  needsSponsorship: string
  linkedinUrl: string
  githubUrl: string
  portfolioUrl: string
  source: string
  sourceDetail: string
  referrer: RelationOption | null
  tags: string
  job: RelationOption | null
  inTalentPool: boolean
}

// Adds a candidate from anywhere: the candidates list, a job's pipeline (with requisitionId, the
// job is fixed), or the referral board (defaultSource 'referral').
export function CandidateFormDrawer({
  open,
  onOpenChange,
  requisitionId,
  defaultSource,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requisitionId?: Uuid
  defaultSource?: string
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      size="lg"
    >
      <CandidateForm
        requisitionId={requisitionId}
        defaultSource={defaultSource}
        onCancel={() => onOpenChange(false)}
        onSuccess={() => onOpenChange(false)}
      />
    </FormDrawer>
  )
}

function CandidateForm({
  requisitionId,
  defaultSource,
  onCancel,
  onSuccess,
}: {
  requisitionId?: Uuid
  defaultSource?: string
  onCancel: () => void
  onSuccess: () => void
}) {
  const create = useCreateCandidate()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string>()
  const [existing, setExisting] = useState<{ id: Uuid; name: string } | null>(null)

  const fixedJob = useQuery({
    queryKey: ['requisitions', 'option', requisitionId],
    queryFn: async () => (requisitionId ? (await resolveRequisitions([requisitionId]))[0] : null),
    enabled: Boolean(requisitionId),
  })

  const defaultValues: CandidateValues = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    country: '',
    workAuthorized: 'unknown',
    needsSponsorship: 'unknown',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    source: defaultSource ?? 'sourced',
    sourceDetail: '',
    referrer: null,
    tags: '',
    job: null,
    inTalentPool: !requisitionId,
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      const job = requisitionId ? fixedJob.data : value.job
      const needsDetail = value.source === 'agency' || value.source === 'job_board'

      try {
        const result = await create.mutateAsync({
          data: {
            firstName: value.firstName.trim(),
            lastName: value.lastName.trim(),
            email: value.email.trim(),
            phone: value.phone.trim() || null,
            city: value.city.trim() || null,
            country: value.country.trim() || null,
            workAuthorized: triState(value.workAuthorized),
            needsSponsorship: triState(value.needsSponsorship),
            linkedinUrl: value.linkedinUrl.trim() || null,
            githubUrl: value.githubUrl.trim() || null,
            portfolioUrl: value.portfolioUrl.trim() || null,
            source: value.source,
            sourceDetail: needsDetail ? value.sourceDetail.trim() || null : null,
            referrerUserId: value.source === 'referral' ? (value.referrer?.value ?? null) : null,
            tags: joinTags(splitTags(value.tags)),
            inTalentPool: value.inTalentPool,
          },
          requisition: job ? { id: job.value, title: job.label } : null,
        })

        onSuccess()

        // From the list, land on the new profile. From a pipeline, stay on the board.
        if (!requisitionId) {
          void navigate({ to: '/ats/candidates/$candidateId', params: { candidateId: result.id } })
        }
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <FieldSet>
          <FieldLegend variant="label">{copy.person}</FieldLegend>
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
              validators={{
                onBlur: requiredEmail(copy.email),
                onSubmit: requiredEmail(copy.email),
              }}
              listeners={{
                onBlur: async ({ value }) => {
                  if (!requiredEmail(copy.email).safeParse(value).success) {
                    setExisting(null)

                    return
                  }

                  const match = await findCandidateByEmail(value).catch(() => null)
                  setExisting(match ? { id: match.id, name: candidateName(match) } : null)
                },
              }}
            >
              {(field) => (
                <field.TextField
                  label={copy.email}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  className="sm:col-span-2"
                />
              )}
            </form.AppField>
            {existing ? (
              <p className="flex items-start gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-sm sm:col-span-2">
                <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
                <span>
                  {copy.emailExists(existing.name)}{' '}
                  <a
                    href={`/ats/candidates/${existing.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {copy.open}
                  </a>
                </span>
              </p>
            ) : null}
            <form.AppField
              name="phone"
              validators={{ onBlur: optionalPhone, onSubmit: optionalPhone }}
            >
              {(field) => (
                <field.TextField label={copy.phone} type="tel" optional autoComplete="off" />
              )}
            </form.AppField>
            <div className="hidden sm:block" />
            <form.AppField name="city">
              {(field) => <field.TextField label={copy.city} optional autoComplete="off" />}
            </form.AppField>
            <form.AppField name="country">
              {(field) => <field.TextField label={copy.country} optional autoComplete="off" />}
            </form.AppField>
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">{copy.eligibility}</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="workAuthorized">
              {(field) => (
                <field.SelectField label={copy.workAuthorized} optional options={triStateOptions} />
              )}
            </form.AppField>
            <form.AppField name="needsSponsorship">
              {(field) => (
                <field.SelectField
                  label={copy.needsSponsorship}
                  optional
                  options={triStateOptions}
                />
              )}
            </form.AppField>
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">{copy.links}</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['linkedinUrl', copy.linkedin, 'https://linkedin.com/in/…'],
                ['githubUrl', copy.github, 'https://github.com/…'],
                ['portfolioUrl', copy.portfolio, 'https://…'],
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
                    type="url"
                    inputMode="url"
                    optional
                    placeholder={placeholder}
                    autoComplete="off"
                    autoCapitalize="none"
                  />
                )}
              </form.AppField>
            ))}
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">{copy.sourcing}</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="source">
              {(field) => <field.SelectField label={copy.source} options={sourceOptions} />}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.source}>
              {(source) =>
                source === 'agency' || source === 'job_board' ? (
                  <form.AppField
                    name="sourceDetail"
                    validators={
                      source === 'agency'
                        ? {
                            onBlur: requiredText(copy.agency),
                            onSubmit: requiredText(copy.agency),
                          }
                        : undefined
                    }
                  >
                    {(field) => (
                      <field.TextField
                        label={source === 'agency' ? copy.agency : copy.sourceDetail}
                        optional={source !== 'agency'}
                      />
                    )}
                  </form.AppField>
                ) : source === 'referral' ? (
                  <form.AppField name="referrer">
                    {(field) => (
                      <field.RelationField
                        label={copy.referrer}
                        optional
                        search={lookupUsers}
                        placeholder={appCopy.form.searchPlaceholder(copy.referrer)}
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>
            <form.AppField name="tags">
              {(field) => (
                <field.TextField
                  label={copy.tags}
                  optional
                  hint={copy.tagsHint}
                  className="sm:col-span-2"
                  autoComplete="off"
                />
              )}
            </form.AppField>
            {requisitionId ? null : (
              <form.AppField
                name="job"
                listeners={{
                  onChange: ({ value }) => form.setFieldValue('inTalentPool', !value),
                }}
              >
                {(field) => (
                  <field.RelationField
                    label={copy.job}
                    optional
                    hint={copy.jobHint}
                    search={lookupRequisitions}
                    placeholder={copy.noJob}
                    searchPlaceholder={appCopy.form.searchPlaceholder(copy.job)}
                    className="sm:col-span-2"
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name="inTalentPool">
              {(field) => (
                <field.CheckboxField
                  label={copy.pool}
                  hint={copy.poolHint}
                  className="sm:col-span-2"
                />
              )}
            </form.AppField>
          </div>
        </FieldSet>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          {copy.privacy}
        </p>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onCancel}>
        <form.AppForm>
          <form.SubmitButton label={copy.submit} pendingLabel={appCopy.form.creating} />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
