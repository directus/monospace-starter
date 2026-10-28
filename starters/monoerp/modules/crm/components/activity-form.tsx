import { useStore } from '@tanstack/react-form'
import { CalendarDays, Mail, MessageSquareText, Phone, Plus } from 'lucide-react'
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
import { requiredRelation, requiredText } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { fromDateTimeInput, nowInput, toDateTimeInput } from '@/lib/dates'
import { useCollectionAccess } from '@/lib/permissions'
import { ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { filterRelationOptions } from '@/modules/crm/activity'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupContacts, lookupDeals, lookupOrganizations } from '@/modules/crm/data'
import { useCreateActivity, useUpdateActivity } from '@/modules/crm/mutations'

const copy = crmCopy.activity

export const activityTypes = [
  { value: 'call', label: copy.types.call, icon: Phone },
  { value: 'email', label: copy.types.email, icon: Mail },
  { value: 'meeting', label: copy.types.meeting, icon: CalendarDays },
  { value: 'note', label: copy.types.note, icon: MessageSquareText },
] as const

export type ActivityType = (typeof activityTypes)[number]['value']

export const activityIcons = Object.fromEntries(
  activityTypes.map((item) => [item.value, item.icon]),
)

const directionOptions = [
  { value: 'outbound', label: copy.directions.outbound },
  { value: 'inbound', label: copy.directions.inbound },
]

export type ActivityInitial = {
  id: Uuid
  type?: string | null
  status?: string | null
  direction?: string | null
  subject?: string | null
  body?: string | null
  occurredAt?: string | null
  dueAt?: string | null
  completedAt?: string | null
  organization?: RelationOption | null
  contact?: RelationOption | null
  deal?: RelationOption | null
  owner?: RelationOption | null
}

type ActivityValues = {
  type: ActivityType
  subject: string
  body: string
  organization: RelationOption | null
  contact: RelationOption | null
  deal: RelationOption | null
  owner: RelationOption | null
  occurredAt: string
  direction: string
  done: boolean
}

export type ActivityDefaults = {
  organization?: RelationOption
  organizationOptions?: Array<RelationOption>
  contact?: RelationOption
  deal?: RelationOption
  type?: ActivityType
  // Open the drawer in "schedule" mode: unchecked Done, time in the future.
  scheduled?: boolean
}

function ActivityDrawer({
  initial,
  defaults,
  trigger,
  open,
  onOpenChange,
}: {
  initial?: ActivityInitial
  defaults?: ActivityDefaults
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [isOpen, setOpen] = useControllableOpen(open, onOpenChange)

  const title = initial
    ? appCopy.form.edit(copy.singular)
    : defaults?.scheduled
      ? copy.schedule
      : copy.log

  return (
    <FormDrawer open={isOpen} onOpenChange={setOpen} trigger={trigger} title={title}>
      <ActivityForm
        initial={initial}
        defaults={defaults}
        onCancel={() => setOpen(false)}
        onSuccess={() => setOpen(false)}
      />
    </FormDrawer>
  )
}

export function LogActivityButton(props: { defaults?: ActivityDefaults }) {
  const access = useCollectionAccess('activities')

  if (!access.create) return null

  return (
    <ActivityDrawer
      defaults={props.defaults}
      trigger={
        <Button>
          <Plus data-icon="inline-start" />
          {copy.log}
        </Button>
      }
    />
  )
}

export function ActivityForm({
  initial,
  defaults,
  onCancel,
  onSuccess,
}: {
  initial?: ActivityInitial
  defaults?: ActivityDefaults
  onCancel?: () => void
  onSuccess?: () => void
}) {
  const create = useCreateActivity()
  const update = useUpdateActivity()
  const currentUser = useCurrentUser()

  const defaultValues: ActivityValues = {
    // SAFETY: activities.type only holds ActivityType values, but Monospace types it as a plain
    // string; see docs/monospace.md, known issues.
    type: (initial?.type ?? defaults?.type ?? 'call') as ActivityType,
    subject: initial?.subject ?? '',
    body: initial?.body ?? '',
    organization: initial?.organization ?? defaults?.organization ?? null,
    contact: initial?.contact ?? defaults?.contact ?? null,
    deal: initial?.deal ?? defaults?.deal ?? null,
    // New activities belong to whoever logs them.
    owner: (initial ? initial.owner : ownerOption(currentUser)) ?? null,
    occurredAt: initial?.occurredAt ? toDateTimeInput(initial.occurredAt) : nowInput(),
    direction:
      initial?.direction && initial.direction !== 'internal' ? initial.direction : 'outbound',
    done: initial ? initial.status === 'completed' : !defaults?.scheduled,
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value, formApi }) =>
      submitForm(formApi, async () => {
        if (!value.organization) return
        const hasDirection = value.type === 'call' || value.type === 'email'
        const when = fromDateTimeInput(value.occurredAt) ?? new Date().toISOString()

        const base = {
          type: value.type,
          status: value.done ? 'completed' : 'open',
          direction: hasDirection ? value.direction : 'internal',
          subject: value.subject.trim(),
          body: value.body.trim() || null,
          occurredAt: when,
          dueAt: value.done ? null : when,
          completedAt: value.done ? (initial?.completedAt ?? new Date().toISOString()) : null,
        }

        if (initial) {
          await update.mutateAsync({
            id: initial.id,
            data: {
              ...base,
              organizationId: value.organization.value,
              contactId: value.contact?.value ?? null,
              dealId: value.deal?.value ?? null,
              ownerUserId: value.owner?.value ?? null,
            },
          })
        } else {
          await create.mutateAsync({
            ...base,
            organization: { _connect: { key: { id: value.organization.value } } },
            contact: value.contact ? { _connect: { key: { id: value.contact.value } } } : undefined,
            deal: value.deal ? { _connect: { key: { id: value.deal.value } } } : undefined,
            owner: value.owner ? { _connect: { key: { id: value.owner.value } } } : undefined,
          })
        }

        onSuccess?.()
      }),
  })

  const type = useStore(form.store, (state) => state.values.type)
  const done = useStore(form.store, (state) => state.values.done)
  const organizationId = useStore(form.store, (state) => state.values.organization?.value)

  const searchContacts = useCallback(
    (q: string) => lookupContacts(q, organizationId),
    [organizationId],
  )

  const searchDeals = useCallback((q: string) => lookupDeals(q, organizationId), [organizationId])

  const searchOrganizations = useCallback(
    (q: string) => {
      if (!defaults?.organizationOptions) return lookupOrganizations(q)

      return Promise.resolve(filterRelationOptions(defaults.organizationOptions, q))
    },
    [defaults],
  )

  const organizationSearchKey = defaults?.organizationOptions
    ?.map((option) => option.value)
    .join(',')

  const hasDirection = type === 'call' || type === 'email'

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        <form.Field name="type">
          {(field) => (
            <FieldSet className="gap-2">
              <FieldLegend variant="label" id="activity-type-label" className="mb-0">
                {copy.form.type}
              </FieldLegend>
              <RadioGroup
                name={field.name}
                value={field.state.value}
                onValueChange={(value) => {
                  const picked = activityTypes.find((item) => item.value === value)

                  if (picked) field.handleChange(picked.value)
                }}
                aria-labelledby="activity-type-label"
                className="grid-cols-2 sm:grid-cols-4"
              >
                {activityTypes.map((item) => {
                  const Icon = item.icon

                  return (
                    <RadioGroupItem key={item.value} value={item.value} className="h-8 gap-2">
                      <Icon className="size-4" />
                      {item.label}
                    </RadioGroupItem>
                  )
                })}
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <form.AppField
          name="subject"
          validators={{
            onBlur: requiredText(copy.subject),
            onSubmit: requiredText(copy.subject),
          }}
        >
          {(field) => (
            <field.TextField
              label={copy.subject}
              placeholder={copy.form.subjectPlaceholders[type]}
              autoFocus={Boolean(initial) || Boolean(defaults?.organization)}
            />
          )}
        </form.AppField>

        <form.AppField name="body">
          {(field) => (
            <field.TextareaField
              label={copy.notes}
              optional
              className="[&_textarea]:min-h-24"
              placeholder={copy.notesPlaceholder}
            />
          )}
        </form.AppField>

        <FieldSet>
          <FieldLegend variant="label">{copy.relatedTo}</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField
              name="organization"
              validators={{ onSubmit: requiredRelation(crmCopy.organizations.singular) }}
            >
              {(field) => (
                <field.RelationField
                  label={crmCopy.organizations.singular}
                  search={searchOrganizations}
                  searchKey={organizationSearchKey}
                  placeholder={copy.selectOrganization}
                  searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.organizations.title)}
                  disabled={Boolean(defaults?.organization) && !initial}
                  autoFocus={!initial && !defaults?.organization}
                />
              )}
            </form.AppField>
            <form.AppField name="contact">
              {(field) => (
                <field.RelationField
                  label={crmCopy.contacts.singular}
                  optional
                  search={searchContacts}
                  searchKey={organizationId}
                  placeholder={copy.selectContact}
                  searchPlaceholder={appCopy.form.searchPlaceholder(crmCopy.contacts.title)}
                  disabled={Boolean(defaults?.contact) && !initial}
                />
              )}
            </form.AppField>
            <form.AppField name="deal">
              {(field) => (
                <field.RelationField
                  label={crmCopy.deals.singular}
                  optional
                  search={searchDeals}
                  searchKey={organizationId}
                  placeholder={copy.selectDeal}
                  searchPlaceholder={copy.searchDeals}
                  disabled={Boolean(defaults?.deal) && !initial}
                />
              )}
            </form.AppField>
          </div>
        </FieldSet>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="owner">
            {(field) => (
              <field.RelationField
                label={appCopy.common.owner}
                optional
                search={lookupUsers}
                placeholder={appCopy.inline.assign}
                searchPlaceholder={appCopy.form.searchPlaceholder(appCopy.common.owner)}
                className="sm:col-span-2"
              />
            )}
          </form.AppField>
          <form.AppField name="occurredAt">
            {(field) => (
              <field.TextField label={done ? copy.when : copy.form.dueAt} type="datetime-local" />
            )}
          </form.AppField>
          {hasDirection ? (
            <form.AppField name="direction">
              {(field) => <field.SelectField label={copy.direction} options={directionOptions} />}
            </form.AppField>
          ) : null}
          <form.AppField name="done">
            {(field) => (
              <field.CheckboxField
                label={copy.done}
                hint={copy.doneHint}
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
            label={initial ? appCopy.form.save : done ? copy.log : copy.schedule}
            pendingLabel={appCopy.form.saving}
          />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
