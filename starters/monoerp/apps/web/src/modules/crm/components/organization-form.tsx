import { Plus, Trash2 } from 'lucide-react'
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
import {
  optionalDomain,
  optionalPhone,
  requiredEmail,
  requiredText,
} from '@/components/form/validators'
import type { RelationOption } from '@/components/form/relation-combobox'
import { Button } from '@/components/ui/button'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { monospace } from '@/lib/monospace'
import { crmCopy } from '@/modules/crm/crm.copy'
import { useCreateOrganization } from '@/modules/crm/mutations'

const copy = crmCopy.organizations

const statusOptions = [
  { value: 'prospect', label: copy.statuses.prospect },
  { value: 'active', label: copy.statuses.active },
  { value: 'inactive', label: copy.statuses.inactive },
]

type ContactValues = {
  key: string
  firstName: string
  lastName: string
  email: string
  phone: string
  title: string
  isPrimary: boolean
}

const emptyContact = (): ContactValues => ({
  key: crypto.randomUUID(),
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  title: '',
  isPrimary: false,
})

function contactHasData(contact: ContactValues) {
  return Boolean(
    contact.firstName.trim() ||
    contact.lastName.trim() ||
    contact.email.trim() ||
    contact.phone.trim() ||
    contact.title.trim(),
  )
}

export function OrganizationDrawer({
  defaultContact,
  trigger,
  open,
  onOpenChange,
}: {
  // Link this existing contact to the new organization on create.
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
      size="lg"
    >
      <OrganizationForm
        defaultContact={defaultContact}
        onCancel={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
    </FormDrawer>
  )
}

type OrganizationValues = {
  name: string
  domain: string
  industry: string
  status: string
  contacts: Array<ContactValues>
}

export function OrganizationForm({
  defaultContact,
  onCancel,
  onSuccess,
}: {
  defaultContact?: RelationOption
  onCancel?: () => void
  onSuccess?: () => void
}) {
  const create = useCreateOrganization()
  const [submitError, setSubmitError] = useState<string>()

  const defaultValues: OrganizationValues = {
    name: '',
    domain: '',
    industry: '',
    status: 'prospect',
    contacts: [],
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)

      const base = {
        name: value.name.trim(),
        domain: value.domain.trim() || null,
        industry: value.industry.trim() || null,
        status: value.status,
      }

      try {
        const contactOrganizations: NonNullable<
          Parameters<typeof create.mutateAsync>[0]['contact_organizations']
        > = defaultContact
          ? [
              {
                _create: {
                  data: [
                    {
                      contacts: { _connect: { key: { id: defaultContact.value } } },
                      isPrimary: false,
                    },
                  ],
                },
              },
            ]
          : []

        await create.mutateAsync({
          ...base,
          contact_organizations: contactOrganizations.concat(
            value.contacts.map((contact) => ({
              _create: {
                data: [
                  {
                    contacts: {
                      _create: {
                        data: {
                          firstName: contact.firstName.trim(),
                          lastName: contact.lastName.trim(),
                          email: contact.email.trim(),
                          phone: contact.phone.trim() || null,
                          status: 'active',
                        },
                      },
                    },
                    title: contact.title.trim() || null,
                    isPrimary: contact.isPrimary,
                  },
                ],
              },
            })),
          ),
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
            name="name"
            validators={{
              onBlur: requiredText(copy.form.name),
              onSubmit: requiredText(copy.form.name),
            }}
          >
            {(field) => (
              <field.TextField label={copy.form.name} autoFocus className="sm:col-span-2" />
            )}
          </form.AppField>
          <form.AppField
            name="domain"
            validators={{
              onBlur: optionalDomain,
              onSubmit: optionalDomain,
              onBlurAsyncDebounceMs: 400,
              onBlurAsync: async ({ value }) => {
                const domain = value.trim()

                if (!domain || !optionalDomain.safeParse(domain).success) return undefined

                const matches = await monospace.organizations.readMany({
                  fields: ['id'],
                  filter: { domain },
                  limit: 1,
                })

                return matches.length > 0 ? { message: copy.form.domainTaken } : undefined
              },
            }}
          >
            {(field) => (
              <field.TextField
                label={copy.form.domain}
                optional
                placeholder="example.com"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
              />
            )}
          </form.AppField>
          <form.AppField name="industry">
            {(field) => <field.TextField label={copy.form.industry} optional />}
          </form.AppField>
          <form.AppField name="status">
            {(field) => <field.SelectField label={copy.form.status} options={statusOptions} />}
          </form.AppField>
        </div>

        <form.Field name="contacts" mode="array">
          {(field) => (
            <FieldSet>
              <FieldLegend variant="label">{copy.form.initialContacts}</FieldLegend>
              {field.state.value.map((contact, index) => (
                <div key={contact.key} className="relative rounded-lg border p-4">
                  <RemoveContactControl
                    contact={contact}
                    onRemove={() => field.removeValue(index)}
                  />
                  <div className="grid gap-4 sm:grid-cols-2 sm:pr-10">
                    <form.AppField
                      name={`contacts[${index}].firstName`}
                      validators={{
                        onBlur: requiredText(crmCopy.contacts.form.firstName),
                        onSubmit: requiredText(crmCopy.contacts.form.firstName),
                      }}
                    >
                      {(sub) => <sub.TextField label={crmCopy.contacts.form.firstName} />}
                    </form.AppField>
                    <form.AppField
                      name={`contacts[${index}].lastName`}
                      validators={{
                        onBlur: requiredText(crmCopy.contacts.form.lastName),
                        onSubmit: requiredText(crmCopy.contacts.form.lastName),
                      }}
                    >
                      {(sub) => <sub.TextField label={crmCopy.contacts.form.lastName} />}
                    </form.AppField>
                    <form.AppField
                      name={`contacts[${index}].email`}
                      validators={{
                        onBlur: requiredEmail(crmCopy.contacts.form.email),
                        onSubmit: requiredEmail(crmCopy.contacts.form.email),
                      }}
                    >
                      {(sub) => (
                        <sub.TextField
                          label={crmCopy.contacts.form.email}
                          type="email"
                          autoComplete="off"
                        />
                      )}
                    </form.AppField>
                    <form.AppField
                      name={`contacts[${index}].phone`}
                      validators={{ onBlur: optionalPhone, onSubmit: optionalPhone }}
                    >
                      {(sub) => (
                        <sub.TextField
                          label={crmCopy.contacts.form.phone}
                          type="tel"
                          optional
                          autoComplete="off"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`contacts[${index}].title`}>
                      {(sub) => <sub.TextField label={crmCopy.contacts.jobTitle} optional />}
                    </form.AppField>
                    <form.AppField name={`contacts[${index}].isPrimary`}>
                      {(sub) => (
                        <sub.CheckboxField
                          label={copy.form.primaryContact}
                          className="sm:self-end sm:pb-2"
                        />
                      )}
                    </form.AppField>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  field.pushValue({ ...emptyContact(), isPrimary: field.state.value.length === 0 })
                }
              >
                <Plus data-icon="inline-start" />
                {copy.form.addContact}
              </Button>
            </FieldSet>
          )}
        </form.Field>
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

function RemoveContactControl({
  contact,
  onRemove,
}: {
  contact: ContactValues
  onRemove: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">{copy.form.removeContactConfirm}</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            {appCopy.common.cancel}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onRemove}>
            {appCopy.common.delete}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="absolute top-2.5 right-2.5 text-muted-foreground transition-[background-color,color,fill] duration-150 ease-out hover:bg-destructive/10 hover:text-destructive hover:[&_svg]:fill-current"
      onClick={() => {
        if (contactHasData(contact)) setConfirming(true)
        else onRemove()
      }}
    >
      <Trash2 />
      <span className="sr-only">{copy.form.removeContact}</span>
    </Button>
  )
}
