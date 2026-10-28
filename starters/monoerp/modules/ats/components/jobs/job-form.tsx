import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { requiredText } from '@/components/form/validators'
import { errorMessage } from '@/lib/errors'
import { lookupUsers } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  optionsFor,
  textOrNull,
  toUuidOrNull,
  wholeNumber,
} from '@/modules/ats/components/requests/form-helpers'
import { defaultStages } from '@/modules/ats/components/requests/kickoff-form'
import { LocationsField } from '@/modules/ats/components/requests/locations-field'
import { departmentsQuery, jobLevelsQuery } from '@/modules/ats/data/shared'
import { useCreateJob } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs.create

const openings = wholeNumber({ min: 1, max: 50 })

type JobValues = {
  title: string
  departmentId: string
  jobLevelId: string
  employmentType: string
  numberOfHires: string
  locations: string
  hiringManager: RelationOption | null
  recruiter: RelationOption | null
  isLeadership: boolean
  urgency: string
}

const defaultValues: JobValues = {
  title: '',
  departmentId: '',
  jobLevelId: '',
  employmentType: 'full_time',
  numberOfHires: '1',
  locations: '',
  hiringManager: null,
  recruiter: null,
  isLeadership: false,
  urgency: 'normal',
}

// A job without a role request behind it: a draft with the standard interview plan.
export function JobFormDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
    >
      <JobForm onDone={() => onOpenChange(false)} />
    </FormDrawer>
  )
}

function JobForm({ onDone }: { onDone: () => void }) {
  const create = useCreateJob()
  const navigate = useNavigate()
  const departments = useQuery(departmentsQuery())
  const levels = useQuery(jobLevelsQuery())
  const [submitError, setSubmitError] = useState<string>()

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      const departmentId = toUuidOrNull(value.departmentId)
      const jobLevelId = toUuidOrNull(value.jobLevelId)

      if (!departmentId) return

      try {
        const job = await create.mutateAsync({
          title: value.title.trim(),
          status: 'draft',
          departments: { _connect: { key: { id: departmentId } } },
          job_levels: jobLevelId ? { _connect: { key: { id: jobLevelId } } } : undefined,
          employmentType: value.employmentType,
          numberOfHires: Number(value.numberOfHires),
          locations: textOrNull(value.locations),
          hiringManagerUserId: value.hiringManager?.value ?? null,
          recruiterUserId: value.recruiter?.value ?? null,
          isLeadership: value.isLeadership,
          urgency: value.urgency,
          interview_stages: [
            {
              _create: {
                data: defaultStages(value.isLeadership).map((stage, index) => ({
                  name: stage.name,
                  kind: stage.kind,
                  position: index + 1,
                })),
              },
            },
          ],
        })

        onDone()

        if (job.id) await navigate({ to: '/ats/jobs/$jobId', params: { jobId: job.id } })
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const departmentOptions = (departments.data ?? []).map((row) => ({
    value: row.id,
    label: row.name ?? '',
  }))

  const levelOptions = (levels.data ?? []).map((row) => ({ value: row.id, label: row.name ?? '' }))

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="title"
            validators={{
              onBlur: requiredText(copy.jobTitle),
              onSubmit: requiredText(copy.jobTitle),
            }}
          >
            {(field) => (
              <field.TextField label={copy.jobTitle} autoFocus className="sm:col-span-2" />
            )}
          </form.AppField>
          <form.AppField
            name="departmentId"
            validators={{ onSubmit: requiredText(copy.department) }}
          >
            {(field) => (
              <field.SelectField
                label={copy.department}
                options={departmentOptions}
                placeholder={copy.selectPlaceholder}
              />
            )}
          </form.AppField>
          <form.AppField name="jobLevelId">
            {(field) => (
              <field.SelectField
                label={copy.level}
                options={levelOptions}
                placeholder={copy.selectPlaceholder}
                optional
              />
            )}
          </form.AppField>
          <form.AppField name="employmentType">
            {(field) => (
              <field.SelectField
                label={copy.employmentType}
                options={optionsFor('employmentType')}
              />
            )}
          </form.AppField>
          <form.AppField name="numberOfHires" validators={{ onBlur: openings, onSubmit: openings }}>
            {(field) => <field.TextField label={copy.openings} inputMode="numeric" />}
          </form.AppField>
        </div>
        <form.AppField name="locations">
          {() => <LocationsField label={copy.locations} optional />}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="hiringManager">
            {(field) => (
              <field.RelationField
                label={copy.hiringManager}
                search={lookupUsers}
                placeholder={copy.selectPlaceholder}
                optional
              />
            )}
          </form.AppField>
          <form.AppField name="recruiter">
            {(field) => (
              <field.RelationField
                label={copy.recruiter}
                search={lookupUsers}
                placeholder={copy.selectPlaceholder}
                optional
              />
            )}
          </form.AppField>
          <form.AppField name="urgency">
            {(field) => <field.SelectField label={copy.urgency} options={optionsFor('urgency')} />}
          </form.AppField>
        </div>
        <form.AppField name="isLeadership">
          {(field) => <field.CheckboxField label={copy.leadership} hint={copy.leadershipHint} />}
        </form.AppField>
      </DrawerFormBody>
      <DrawerFormFooter error={submitError} onCancel={onDone}>
        <form.AppForm>
          <form.SubmitButton label={copy.submit} pendingLabel={copy.submitting} />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
