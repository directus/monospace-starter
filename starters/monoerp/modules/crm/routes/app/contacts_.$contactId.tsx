import { noop, useQueries, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Link2, Mail, Phone, Plus, Paperclip } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { SectionBoundary } from '@/components/data-state'
import { optionalPhone, requiredEmail } from '@/components/form/validators'
import {
  InlineReadOnly,
  InlineSelect,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { InlineOwner } from '@/components/inline/inline-owner'
import { NotesEditor } from '@/components/notes-editor'
import { PageHeader } from '@/components/page-header'
import { RecordDetails } from '@/components/record-details'
import { RecordMenu } from '@/components/record-menu'
import { RecordName } from '@/components/record-title'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { ensureOrNotFound } from '@/lib/route-loaders'
import { uuidParam } from '@/lib/uuid'
import {
  affiliationSpan,
  groupAffiliations,
  groupTenure,
  groupTitle,
} from '@/modules/crm/affiliations'
import { AffiliationDrawer } from '@/modules/crm/components/affiliation-form'
import type { AffiliationInitial } from '@/modules/crm/components/affiliation-form'
import { AffiliationsPanel } from '@/modules/crm/components/affiliations-panel'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import { ContactAvatar, OrganizationLabel } from '@/modules/crm/components/entities'
import { AttachmentsPanel } from '@/modules/crm/components/files/panel'
import { useAttachFiles } from '@/modules/crm/components/files/uploads'
import { OrganizationDrawer } from '@/modules/crm/components/organization-form'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { RecordTabs } from '@/modules/crm/components/record-tabs'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { attachmentsQuery, contactDetailQuery } from '@/modules/crm/data'
import { contactName, contactStatusOptions } from '@/modules/crm/entities'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
} from '@/modules/crm/entities'
import { DealIcon, OrganizationIcon } from '@/modules/crm/icons'
import { useDeleteContact, useUpdateAffiliation, useUpdateContact } from '@/modules/crm/mutations'
import { contactPanels } from '@/modules/crm/slots'

export const Route = createFileRoute('/_app/crm/contacts_/$contactId')({
  params: { parse: ({ contactId }) => ({ contactId: uuidParam(contactId) }) },
  staticData: {
    page: {
      title: crmCopy.contacts.singular,
      module: 'crm',
      parent: '/crm/contacts',
      recordTitle: (queryClient, { contactId }) => {
        const record = queryClient.getQueryData(contactDetailQuery(uuidParam(contactId)).queryKey)

        return record ? contactName(record) : undefined
      },
    },
  },
  loader: async ({ context: { queryClient }, params }) => {
    const contact = await ensureOrNotFound(queryClient, contactDetailQuery(params.contactId))

    for (const panel of contactPanels) panel.prefetch?.(queryClient, { email: contact.email })
    void queryClient.query(attachmentsQuery({ contactId: params.contactId })).catch(noop)
  },
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { contactId } = Route.useParams()
  const navigate = useNavigate()
  const contactQuery = useSuspenseQuery(contactDetailQuery(contactId))
  const access = useCollectionAccess('contacts')
  const affiliationAccess = useCollectionAccess('affiliations')
  const organizationAccess = useCollectionAccess('organizations')
  const dealAccess = useCollectionAccess('deals')

  const history = useQueries({
    queries: contactPanels.map((panel) => panel.historyQuery({ email: contactQuery.data?.email })),
  })

  const remove = useDeleteContact()
  const update = useUpdateContact()
  const updateAffiliation = useUpdateAffiliation()
  const attachmentAccess = useCollectionAccess('attachments')
  const attach = useAttachFiles()
  const updateNotes = useUpdateContact({ notify: false })
  const [deleting, setDeleting] = useState(false)
  const [addingDeal, setAddingDeal] = useState(false)
  const [addingOrganization, setAddingOrganization] = useState<'new' | 'existing'>()
  const [now] = useState(() => Date.now())

  const contact = contactQuery.data
  const affiliations = contact.affiliations?.data ?? []
  const activities = contact.activities?.data ?? []
  const extraEntries = history.flatMap((query) => query.data ?? [])
  const name = `${contact.firstName ?? crmCopy.contacts.restrictedName.first} ${contact.lastName ?? crmCopy.contacts.restrictedName.last}`
  const groups = groupAffiliations(affiliations, (row) => row.organization?.id)
  const primaryAffiliation = groups.find((group) => group.isPrimary)?.current

  const organizationOptions = groups.flatMap((group) => {
    const option = toOrganizationOption(group.current?.organization)

    return option ? [option] : []
  })

  const activityOrganization = organizationOptions.length === 1 ? organizationOptions[0] : undefined

  const toInitial = (row: (typeof affiliations)[number]): AffiliationInitial => ({
    id: row.id,
    organization: toOrganizationOption(row.organization),
    title: row.title,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    isPrimary: row.isPrimary,
  })

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id: contactId, data })
  }

  const contactOption = toContactOption({ ...contact, id: contactId })

  const primaryOrganization = toOrganizationOption(primaryAffiliation?.organization) ?? undefined
  // Files roll up to an organization, so a contact needs one to attach anything.
  const attachOrganization = primaryOrganization ?? activityOrganization

  const attachTarget = attachOrganization
    ? { organizationId: attachOrganization.value, contactId: contact.id }
    : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        avatar={<ContactAvatar contact={contact} className="md:size-10" />}
        title={
          <InlineReadOnly value={!access.canUpdate('firstName') || !access.canUpdate('lastName')}>
            <RecordName
              firstName={contact.firstName}
              lastName={contact.lastName}
              labels={{
                first: crmCopy.contacts.form.firstName,
                last: crmCopy.contacts.form.lastName,
                name: crmCopy.contacts.form.name,
              }}

              onSave={(value) => save(value)}
            />
          </InlineReadOnly>
        }
        description={
          primaryAffiliation
            ? [primaryAffiliation.title, primaryOrganization?.label].filter(Boolean).join(' · ') ||
              undefined
            : undefined
        }
        actions={
          <>
            <Button
              variant="outline"
              disabled={!contact.phone}
              nativeButton={!contact.phone}
              title={contact.phone ? undefined : crmCopy.contacts.actions.noPhone}
              render={contact.phone ? <a href={`tel:${contact.phone}`} /> : undefined}
            >
              <Phone data-icon="inline-start" />
              {crmCopy.contacts.actions.call}
            </Button>
            <Button
              variant="outline"
              disabled={!contact.email}
              nativeButton={!contact.email}
              render={contact.email ? <a href={`mailto:${contact.email}`} /> : undefined}
            >
              <Mail data-icon="inline-start" />
              {crmCopy.contacts.actions.email}
            </Button>
            <RecordMenu
              onDelete={
                access.delete
                  ? () => {
                      remove.reset()
                      setDeleting(true)
                    }
                  : undefined
              }
            >
              {dealAccess.create ? (
                <DropdownMenuItem onClick={() => setAddingDeal(true)}>
                  <DealIcon />
                  {appCopy.form.add(crmCopy.deals.singular)}
                </DropdownMenuItem>
              ) : null}
              {attachTarget && attachmentAccess.create ? (
                <DropdownMenuItem onClick={() => attach.pick(attachTarget)}>
                  <Paperclip />
                  {crmCopy.files.attach}
                </DropdownMenuItem>
              ) : null}
            </RecordMenu>
          </>
        }
      />
      {attach.input}
      <OrganizationDrawer
        defaultContact={contactOption}
        open={addingOrganization === 'new'}
        onOpenChange={(open) => !open && setAddingOrganization(undefined)}
      />
      <AffiliationDrawer
        contactId={contact.id}
        open={addingOrganization === 'existing'}
        onOpenChange={(open) => !open && setAddingOrganization(undefined)}
      />
      <DealDrawer
        open={addingDeal}
        onOpenChange={setAddingDeal}
        defaultOrganization={primaryOrganization ?? activityOrganization}
        defaultContact={contactOption}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <RecordDetails title={crmCopy.contacts.details}>
            <PropertyList>
              <Property label={crmCopy.contacts.form.email} readOnly={!access.canUpdate('email')}>
                <InlineText
                  label={crmCopy.contacts.form.email}
                  type="email"
                  value={contact.email}
                  validate={requiredEmail(crmCopy.contacts.form.email)}
                  format={(value) => (
                    <a
                      href={`mailto:${value}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Mail className="size-3.5 text-muted-foreground" />
                      {value}
                    </a>
                  )}
                  action={(value) => (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={crmCopy.contacts.actions.email}
                      render={<a href={`mailto:${value}`} />}
                      nativeButton={false}
                    >
                      <Mail />
                    </Button>
                  )}
                  onSave={(value) => save({ email: value })}
                />
              </Property>
              <Property label={crmCopy.contacts.form.phone} readOnly={!access.canUpdate('phone')}>
                <InlineText
                  label={crmCopy.contacts.form.phone}
                  type="tel"
                  value={contact.phone}
                  validate={optionalPhone}
                  format={(value) => (
                    <a
                      href={`tel:${value}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Phone className="size-3.5 text-muted-foreground" />
                      {value}
                    </a>
                  )}
                  action={(value) => (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={crmCopy.contacts.actions.call}
                      render={<a href={`tel:${value}`} />}
                      nativeButton={false}
                    >
                      <Phone />
                    </Button>
                  )}
                  onSave={(value) => save({ phone: value })}
                />
              </Property>
              {primaryAffiliation?.id ? (
                <Property
                  label={crmCopy.contacts.jobTitle}
                  readOnly={!affiliationAccess.canUpdate('title')}
                >
                  <InlineText
                    label={crmCopy.contacts.jobTitle}
                    value={primaryAffiliation.title}
                    onSave={async (value) => {
                      await updateAffiliation.mutateAsync({
                        id: primaryAffiliation.id ?? '',
                        data: { title: value },
                      })
                    }}
                  />
                </Property>
              ) : null}
              {contactPanels.map(({ id, summaryTitle, summary: Summary }) => (
                <Property key={id} label={summaryTitle}>
                  <SectionBoundary resetKey={contactId}>
                    <Summary email={contact.email} />
                  </SectionBoundary>
                </Property>
              ))}
              <Property label={appCopy.common.status} readOnly={!access.canUpdate('status')}>
                <InlineSelect
                  label={appCopy.common.status}
                  value={contact.status}
                  options={contactStatusOptions}
                  render={(value) => <StatusBadge status={value} />}
                  onSave={(value) => save({ status: value })}
                />
              </Property>
              <Property label={appCopy.common.owner} readOnly={!access.canUpdate('ownerUserId')}>
                <InlineOwner
                  owner={contact.owner}
                  onSave={(ownerUserId) => save({ ownerUserId })}
                />
              </Property>
              <Property label={appCopy.common.lastUpdated}>
                <span className="text-muted-foreground">{formatDate(contact.updatedAt)}</span>
              </Property>
            </PropertyList>
          </RecordDetails>

          <AffiliationsPanel
            anchor={{ contactId }}
            groups={groups}
            toInitial={toInitial}
            title={<>{crmCopy.organizations.title}</>}
            actions={
              affiliationAccess.create ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={appCopy.form.add(crmCopy.organizations.singular)}
                      />
                    }
                  >
                    <Plus />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem
                      disabled={!organizationAccess.create}
                      onClick={() => setAddingOrganization('new')}
                    >
                      <OrganizationIcon />
                      {crmCopy.contacts.affiliations.newOrganization}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAddingOrganization('existing')}>
                      <Link2 />
                      {crmCopy.contacts.affiliations.link}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null
            }
            label={(group) => (
              <OrganizationLabel
                organization={group.roles[0]?.organization}
                className={group.isFormer ? 'text-muted-foreground' : undefined}
                secondary={
                  [
                    group.roles.length === 1 ? groupTitle(group) : null,
                    group.roles.length === 1
                      ? affiliationSpan(group.roles[0]!, now)
                      : groupTenure(group, now),
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
            )}
            emptyMessage={crmCopy.contacts.noAffiliations}
            showPrimary={true}
          />
        </div>

        <RecordTabs
          activity={
            <RecordActivity
              activities={activities}
              extraEntries={extraEntries}
              defaults={{
                contact: contactOption,
                organization: activityOrganization,
                organizationOptions,
              }}
              emptyMessage={crmCopy.contacts.noActivity}
              hide={['contact']}
            />
          }
          notes={
            <NotesEditor
              readOnly={!access.canUpdate('notes')}
              key={contact.id}
              value={contact.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({ id: contact.id, data: { notes } })
              }}
            />
          }
          files={
            attachTarget ? (
              <AttachmentsPanel
                scope={{ contactId }}
                target={attachTarget}
                hide={['contact']}
                emptyMessage={crmCopy.files.noFiles(crmCopy.contacts.singular)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{crmCopy.files.needsOrganization}</p>
            )
          }
          extra={contactPanels.map(({ id, title, component: Panel }) => ({
            id,
            title,
            content: (
              <SectionBoundary resetKey={contactId}>
                <Panel email={contact.email} />
              </SectionBoundary>
            ),
          }))}
        />
      </div>

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        noun={crmCopy.contacts.singular}
        name={name}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          remove.mutate(contact.id, {
            onSuccess: () => navigate({ to: '/crm/contacts' }),
          })
        }
      />
    </div>
  )
}
