import { useState } from 'react'
import type { ReactElement } from 'react'

import { useAppForm } from '@/components/form/app-form'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
  useControllableOpen,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { optionalPhone, requiredEmail, requiredText } from '@/components/form/validators'
import { appCopy } from '@/lib/app.copy'
import { todayInput } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupOrganizations } from '@/modules/crm/data'
import { useCreateContact } from '@/modules/crm/mutations'

const copy = crmCopy.contacts

const statusOptions = [
  { value: 'active', label: copy.statuses.active },
  { value: 'former', label: copy.statuses.former },
]

export type ContactInitial = { firstName?: string; lastName?: string; email?: string }

export function ContactDrawer({
  defaultOrganization,
  initial,
  trigger,
  open,
  onOpenChange,
}: {
  defaultOrganization?: RelationOption
  initial?: ContactInitial
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
      <ContactForm
        defaultOrganization={defaultOrganization}
        initial={initial}
        onCancel={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
    </FormDrawer>
  )
}

type ContactValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  status: string
  organization: RelationOption | null
  title: string
}

export function ContactForm({
  defaultOrganization,
  initial,
  onCancel,
  onSuccess,
}: {
  defaultOrganization?: RelationOption
  initial?: ContactInitial
  onCancel?: () => void
  onSuccess?: () => void
}) {
  const create = useCreateContact()
  const [submitError, setSubmitError] = useState<string>()

  const defaultValues: ContactValues = {
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    email: initial?.email ?? '',
    phone: '',
    status: 'active',
    organization: defaultOrganization ?? null,
    title: '',
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      const base = {
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || null,
        status: value.status,
      }

      try {
        await create.mutateAsync({
          ...base,
          contact_organizations: value.organization
            ? [
                {
                  _create: {
                    data: [
                      {
                        organizations: {
                          _connect: { key: { id: value.organization.value } },
                        },
                        title: value.title.trim() || null,
                        startedAt: todayInput(),
                        isPrimary: true,
                      },
                    ],
                  },
                },
              ]
            : undefined,
        })
        onSuccess?.()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField
            name="firstName"
            validators={{
              onBlur: requiredText(copy.form.firstName),
              onSubmit: requiredText(copy.form.firstName),
            }}
          >
            {(field) => (
              <field.TextField label={copy.form.firstName} autoFocus autoComplete="off" />
            )}
          </form.AppField>
          <form.AppField
            name="lastName"
            validators={{
              onBlur: requiredText(copy.form.lastName),
              onSubmit: requiredText(copy.form.lastName),
            }}
          >
            {(field) => <field.TextField label={copy.form.lastName} autoComplete="off" />}
          </form.AppField>
          <form.AppField
            name="email"
            validators={{
              onBlur: requiredEmail(copy.form.email),
              onSubmit: requiredEmail(copy.form.email),
            }}
          >
            {(field) => <field.TextField label={copy.form.email} type="email" autoComplete="off" />}
          </form.AppField>
          <form.AppField
            name="phone"
            validators={{ onBlur: optionalPhone, onSubmit: optionalPhone }}
          >
            {(field) => (
              <field.TextField label={copy.form.phone} type="tel" optional autoComplete="off" />
            )}
          </form.AppField>
          <form.AppField name="status">
            {(field) => <field.SelectField label={copy.form.status} options={statusOptions} />}
          </form.AppField>
          <form.AppField name="organization">
            {(field) => (
              <field.RelationField
                label={copy.form.organization}
                optional
                search={lookupOrganizations}
                placeholder={crmCopy.activity.selectOrganization}
                searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.organizations.title)}
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          <form.AppField name="title">
            {(field) => <field.TextField label={copy.jobTitle} optional />}
          </form.AppField>
        </div>
      </DrawerFormBody>

      <DrawerFormFooter error={submitError} onCancel={onCancel}>
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
