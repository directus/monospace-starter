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
import { requiredRelation } from '@/components/form/validators'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { toDateInput, todayInput } from '@/lib/dates'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupContacts, lookupOrganizations } from '@/modules/crm/data'
import {
  clearPrimaryAffiliation,
  useCreateAffiliation,
  useUpdateAffiliation,
} from '@/modules/crm/mutations'

const copy = crmCopy.contacts.affiliations

export type AffiliationInitial = {
  id: Uuid
  // Null when a permission rule hides the linked record.
  organization: RelationOption | null
  contact?: RelationOption | null
  title?: string | null
  startedAt?: string | null
  endedAt?: string | null
  isPrimary?: boolean | null
}

// Anchored to one side: a contact linking organizations, or an organization linking contacts.
type Anchor =
  | { contactId: Uuid; organizationId?: never }
  | { organizationId: Uuid; contactId?: never }

export function AffiliationDrawer({
  initial,
  trigger,
  open,
  onOpenChange,
  ...anchor
}: Anchor & {
  initial?: AffiliationInitial
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
      title={initial ? copy.edit : anchor.contactId ? copy.link : copy.linkContact}
    >
      <AffiliationForm
        {...anchor}
        initial={initial}
        onCancel={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
    </FormDrawer>
  )
}

function AffiliationForm({
  initial,
  onCancel,
  onSuccess,
  ...anchor
}: Anchor & {
  initial?: AffiliationInitial
  onCancel?: () => void
  onSuccess?: () => void
}) {
  const pickContact = Boolean(anchor.organizationId)
  const create = useCreateAffiliation()
  const update = useUpdateAffiliation()

  const form = useAppForm({
    defaultValues: {
      organization: initial?.organization ?? null,
      contact: initial?.contact ?? null,
      title: initial?.title ?? '',
      startedAt: initial ? toDateInput(initial.startedAt) : todayInput(),
      endedAt: toDateInput(initial?.endedAt),
      isPrimary: initial?.isPrimary ?? false,
    },
    onSubmit: ({ value, formApi }) =>
      submitForm(formApi, async () => {
        const contactId = anchor.contactId ?? initial?.contact?.value ?? value.contact?.value
        const organizationId = anchor.organizationId ?? value.organization?.value

        if (!contactId || !organizationId) return
        const isPrimary = value.isPrimary && !value.endedAt

        const base = {
          title: value.title.trim() || null,
          startedAt: value.startedAt || null,
          endedAt: value.endedAt || null,
          isPrimary,
        }

        if (isPrimary) await clearPrimaryAffiliation(contactId, initial?.id)

        if (initial) {
          await update.mutateAsync({ id: initial.id, data: base })
        } else {
          await create.mutateAsync({
            ...base,
            contact: { _connect: { key: { id: contactId } } },
            organization: { _connect: { key: { id: organizationId } } },
          })
        }

        onSuccess?.()
      }),
  })

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
          {pickContact ? (
            <form.AppField name="contact" validators={{ onSubmit: requiredRelation(copy.contact) }}>
              {(field) => (
                <field.RelationField
                  label={copy.contact}
                  search={(q) => lookupContacts(q)}
                  placeholder={crmCopy.activity.selectContact}
                  searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.contacts.title)}
                  disabled={Boolean(initial)}
                  autoFocus={!initial}
                />
              )}
            </form.AppField>
          ) : (
            <form.AppField
              name="organization"
              validators={{ onSubmit: requiredRelation(copy.organization) }}
            >
              {(field) => (
                <field.RelationField
                  label={copy.organization}
                  search={lookupOrganizations}
                  placeholder={crmCopy.activity.selectOrganization}
                  searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.organizations.title)}
                  disabled={Boolean(initial)}
                  autoFocus={!initial}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="title">
            {(field) => (
              <field.TextField
                label={crmCopy.contacts.jobTitle}
                optional
                autoFocus={Boolean(initial)}
              />
            )}
          </form.AppField>
          <form.AppField name="startedAt">
            {(field) => <field.TextField label={copy.startedAt} type="date" optional />}
          </form.AppField>
          <form.AppField name="endedAt">
            {(field) => <field.TextField label={copy.endedAt} type="date" optional />}
          </form.AppField>
          <form.AppField name="isPrimary">
            {(field) => (
              <field.CheckboxField
                label={copy.isPrimary}
                hint={copy.isPrimaryHint}
                className="sm:col-span-2"
              />
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
            label={initial ? appCopy.form.save : pickContact ? copy.linkContact : copy.link}
            pendingLabel={appCopy.form.saving}
          />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
