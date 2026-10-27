import { useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { ReactElement } from 'react'

import { useAppForm, submitForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
  useControllableOpen,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { optionalAmount, requiredRelation, requiredText } from '@/components/form/validators'
import { appCopy } from '@/lib/app.copy'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupContacts, lookupOrganizations, pipelineStagesQuery } from '@/modules/crm/data'
import { useCreateDeal } from '@/modules/crm/mutations'
import { stageColor } from '@/modules/crm/stage-color'

const copy = crmCopy.deals

const statusOptions = [
  { value: 'open', label: copy.statuses.open },
  { value: 'won', label: copy.statuses.won },
  { value: 'lost', label: copy.statuses.lost },
]

export const DEAL_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const

const currencyOptions = DEAL_CURRENCIES.map((code) => ({ value: code, label: code }))

export function DealDrawer({
  defaultOrganization,
  defaultContact,
  trigger,
  open,
  onOpenChange,
}: {
  defaultOrganization?: RelationOption
  defaultContact?: RelationOption
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setOpen] = useControllableOpen(open, onOpenChange)

  return (
    <FormDrawer
      open={isOpen}
      onOpenChange={setOpen}
      trigger={trigger}
      title={appCopy.form.add(copy.singular)}
    >
      <DealForm
        defaultOrganization={defaultOrganization}
        defaultContact={defaultContact}
        onCancel={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
    </FormDrawer>
  )
}

type DealValues = {
  title: string
  organization: RelationOption | null
  contact: RelationOption | null
  stageId: string
  status: string
  valueAmount: string
  currency: string
  expectedCloseDate: string
}

function DealForm({
  defaultOrganization,
  defaultContact,
  onCancel,
  onSuccess,
}: {
  defaultOrganization?: RelationOption
  defaultContact?: RelationOption
  onCancel?: () => void
  onSuccess?: () => void
}) {
  const stages = useQuery(pipelineStagesQuery())
  const create = useCreateDeal()

  const stageOptions = (stages.data ?? []).flatMap((stage, index) =>
    stage.id && stage.name
      ? [{ value: stage.id, label: stage.name, color: stageColor(stage, index) }]
      : [],
  )

  const defaultValues: DealValues = {
    title: '',
    organization: defaultOrganization ?? null,
    contact: defaultContact ?? null,
    stageId: '',
    status: 'open',
    valueAmount: '',
    currency: 'USD',
    expectedCloseDate: '',
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value, formApi }) =>
      submitForm(formApi, async () => {
        const stage = stages.data?.find((item) => item.id === value.stageId)

        if (!value.organization || !stage) return

        const base = {
          title: value.title.trim(),
          status: value.status,
          valueAmount: value.valueAmount.trim() || null,
          currency: value.currency,
          expectedCloseDate: value.expectedCloseDate || null,
        }

        await create.mutateAsync({
          ...base,
          organization: { _connect: { key: { id: value.organization.value } } },
          contact: value.contact ? { _connect: { key: { id: value.contact.value } } } : undefined,
          stage: { _connect: { key: { id: stage.id } } },
        })
        onSuccess?.()
      }),
  })

  const organizationId = useStore(form.store, (state) => state.values.organization?.value)

  const searchContacts = useCallback(
    (q: string) => lookupContacts(q, organizationId),
    [organizationId],
  )

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="title"
            validators={{
              onBlur: requiredText(copy.form.title),
              onSubmit: requiredText(copy.form.title),
            }}
          >
            {(field) => (
              <field.TextField
                label={copy.form.title}
                autoFocus={Boolean(defaultOrganization)}
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          <form.AppField
            name="organization"
            validators={{ onSubmit: requiredRelation(copy.form.organization) }}
            listeners={{ onChange: () => form.setFieldValue('contact', null) }}
          >
            {(field) => (
              <field.RelationField
                label={copy.form.organization}
                search={lookupOrganizations}
                placeholder={crmCopy.activity.selectOrganization}
                searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.organizations.title)}
                disabled={Boolean(defaultOrganization)}
                autoFocus={!defaultOrganization}
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          <form.AppField name="contact">
            {(field) => (
              <field.RelationField
                label={copy.form.contact}
                optional
                search={searchContacts}
                searchKey={organizationId}
                placeholder={crmCopy.activity.selectContact}
                searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.contacts.title)}
                disabled={!organizationId}
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          <form.AppField
            name="stageId"
            validators={{ onSubmit: requiredText(copy.form.stage) }}
            listeners={{
              onChange: ({ value }) => {
                const stage = stages.data?.find((item) => item.id === value)

                if (!stage) return
                form.setFieldValue('status', stage.isWon ? 'won' : stage.isClosed ? 'lost' : 'open')
              },
            }}
          >
            {(field) => (
              <field.SelectField
                label={copy.form.stage}
                options={stageOptions}
                placeholder={stages.isPending ? appCopy.search.searching : copy.form.stage}
                disabled={stages.isPending}
              />
            )}
          </form.AppField>
          <form.AppField name="status">
            {(field) => <field.SelectField label={copy.form.status} options={statusOptions} />}
          </form.AppField>
          <form.AppField
            name="valueAmount"
            validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
          >
            {(field) => (
              <field.TextField
                label={copy.form.value}
                optional
                inputMode="decimal"
                placeholder="0.00"
              />
            )}
          </form.AppField>
          <form.AppField name="currency">
            {(field) => <field.SelectField label={copy.form.currency} options={currencyOptions} />}
          </form.AppField>
          <form.AppField name="expectedCloseDate">
            {(field) => (
              <field.TextField label={copy.form.expectedCloseDate} optional type="date" />
            )}
          </form.AppField>
        </div>
      </DrawerFormBody>

      <DrawerFormFooter
        error={
          <form.AppForm>
            <form.FormError />
          </form.AppForm>
        }
        onCancel={onCancel}
      >
        <form.AppForm>
          <form.SubmitButton
            label={appCopy.form.create(copy.singular)}
            pendingLabel={appCopy.form.creating}
          />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
