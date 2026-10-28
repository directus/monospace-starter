import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import { optionalAmount, requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  amountOrNull,
  countOrNull,
  currencyOptions,
  optionalWholeNumber,
  optionsFor,
  textOrNull,
  toUuid,
  toUuidOrNull,
  wholeNumber,
} from '@/modules/ats/components/requests/form-helpers'
import { LocationsField } from '@/modules/ats/components/requests/locations-field'
import type { PlanLine } from '@/modules/ats/data/requests'
import { departmentsQuery, jobLevelsQuery } from '@/modules/ats/data/shared'
import {
  useCreatePlanLine,
  useDeletePlanLine,
  useUpdatePlanLine,
} from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.plan

export function PlanLineDrawer({
  open,
  onOpenChange,
  year,
  line,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  line?: PlanLine
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={line ? copy.editLine : copy.addLine}
      description={line?.status === 'submitted' ? copy.form.lockedHint : undefined}
      size="lg"
    >
      <PlanLineForm
        key={line?.id ?? 'new'}
        year={year}
        line={line}
        onDone={() => onOpenChange(false)}
      />
    </FormDrawer>
  )
}

function PlanLineForm({
  year,
  line,
  onDone,
}: {
  year: number
  line?: PlanLine
  onDone: () => void
}) {
  const departments = useQuery(departmentsQuery())
  const levels = useQuery(jobLevelsQuery())
  const create = useCreatePlanLine()
  const update = useUpdatePlanLine()
  const remove = useDeletePlanLine()
  const [submitError, setSubmitError] = useState<string>()
  const [deleting, setDeleting] = useState(false)

  const form = useAppForm({
    defaultValues: {
      departmentId: line?.departmentId ?? '',
      team: line?.team ?? '',
      roleName: line?.roleName ?? '',
      jobLevelId: line?.jobLevelId ?? '',
      currentHeadcount: String(line?.currentHeadcount ?? 0),
      plannedHeadcount: String(line?.plannedHeadcount ?? 1),
      approvedHeadcount: line?.approvedHeadcount == null ? '' : String(line.approvedHeadcount),
      hireType: line?.hireType ?? 'new',
      employmentType: line?.employmentType ?? 'full_time',
      locations: line?.locations ?? '',
      budgetAmount: line?.budgetAmount ?? '',
      currency: line?.currency ?? 'USD',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      const data = {
        team: textOrNull(value.team),
        roleName: value.roleName.trim(),
        currentHeadcount: Number(value.currentHeadcount),
        plannedHeadcount: Number(value.plannedHeadcount),
        approvedHeadcount: countOrNull(value.approvedHeadcount),
        hireType: value.hireType,
        employmentType: value.employmentType,
        locations: textOrNull(value.locations),
        budgetAmount: amountOrNull(value.budgetAmount),
        currency: value.currency,
      }

      try {
        if (line) {
          await update.mutateAsync({
            id: line.id,
            data: {
              ...data,
              departmentId: toUuid(value.departmentId),
              jobLevelId: toUuidOrNull(value.jobLevelId),
            },
          })
        } else {
          await create.mutateAsync({
            ...data,
            planYear: year,
            status: 'draft',
            departments: { _connect: { key: { id: toUuid(value.departmentId) } } },
            job_levels: value.jobLevelId
              ? { _connect: { key: { id: toUuid(value.jobLevelId) } } }
              : undefined,
          })
        }

        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const departmentOptions = (departments.data ?? []).map((department) => ({
    value: department.id,
    label: department.name ?? '',
  }))

  const levelOptions = (levels.data ?? []).map((level) => ({
    value: level.id,
    label: level.name ?? '',
  }))

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="roleName"
            validators={{
              onBlur: requiredText(copy.form.roleName),
              onSubmit: requiredText(copy.form.roleName),
            }}
          >
            {(field) => (
              <field.TextField label={copy.form.roleName} autoFocus className="sm:col-span-2" />
            )}
          </form.AppField>
          <form.AppField
            name="departmentId"
            validators={{ onSubmit: requiredText(copy.form.department) }}
          >
            {(field) => (
              <field.SelectField
                label={copy.form.department}
                options={departmentOptions}
                placeholder={atsCopy.requests.requests.form.selectPlaceholder}
              />
            )}
          </form.AppField>
          <form.AppField name="team">
            {(field) => <field.TextField label={copy.form.team} optional />}
          </form.AppField>
          <form.AppField name="jobLevelId">
            {(field) => (
              <field.SelectField
                label={copy.form.level}
                options={levelOptions}
                placeholder={atsCopy.requests.requests.form.selectPlaceholder}
                optional
              />
            )}
          </form.AppField>
          <form.AppField name="employmentType">
            {(field) => (
              <field.SelectField
                label={copy.form.employmentType}
                options={optionsFor('employmentType')}
              />
            )}
          </form.AppField>
          <form.AppField name="hireType">
            {(field) => (
              <field.SelectField label={copy.form.hireType} options={optionsFor('hireType')} />
            )}
          </form.AppField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <form.AppField
            name="currentHeadcount"
            validators={{ onBlur: wholeNumber(), onSubmit: wholeNumber() }}
          >
            {(field) => <field.TextField label={copy.form.currentHeadcount} inputMode="numeric" />}
          </form.AppField>
          <form.AppField
            name="plannedHeadcount"
            validators={{ onBlur: wholeNumber(), onSubmit: wholeNumber() }}
          >
            {(field) => <field.TextField label={copy.form.plannedHeadcount} inputMode="numeric" />}
          </form.AppField>
          <form.AppField
            name="approvedHeadcount"
            validators={{ onBlur: optionalWholeNumber, onSubmit: optionalWholeNumber }}
          >
            {(field) => (
              <field.TextField label={copy.form.approvedHeadcount} inputMode="numeric" optional />
            )}
          </form.AppField>
        </div>

        <form.AppField name="locations">
          {() => <LocationsField label={copy.form.locations} optional />}
        </form.AppField>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <form.AppField
            name="budgetAmount"
            validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
          >
            {(field) => (
              <field.TextField
                label={copy.form.budget}
                hint={copy.form.budgetHint}
                inputMode="decimal"
                optional
              />
            )}
          </form.AppField>
          <form.AppField name="currency">
            {(field) => <field.SelectField label={copy.form.currency} options={currencyOptions} />}
          </form.AppField>
        </div>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onDone}>
        {line && line.status !== 'approved' ? (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive max-md:flex-none!"
            onClick={() => {
              remove.reset()
              setDeleting(true)
            }}
          >
            <Trash2 data-icon="inline-start" />
            <span className="max-md:sr-only">{appCopy.common.delete}</span>
          </Button>
        ) : null}
        <form.AppForm>
          <form.SubmitButton
            label={line ? appCopy.form.save : appCopy.form.create(copy.line)}
            pendingLabel={line ? appCopy.form.saving : appCopy.form.creating}
          />
        </form.AppForm>
      </DrawerFormFooter>

      {line ? (
        <DeleteDialog
          open={deleting}
          onOpenChange={setDeleting}
          noun={copy.line}
          name={line.roleName ?? ''}
          pending={remove.isPending}
          error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
          onConfirm={() =>
            remove.mutate(line.id, {
              onSuccess: () => {
                setDeleting(false)
                onDone()
              },
            })
          }
        />
      ) : null}
    </DrawerForm>
  )
}
