import { MonospaceNotFoundError } from '@monospace/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { Link2, Mail, Phone, Plus, Paperclip } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading, SectionBoundary } from '@/components/data-state'
import { NotesEditor } from '@/components/notes-editor'
import { optionalPhone, requiredEmail } from '@/components/form/validators'
import {
  HEADING_WRAP,
  InlineName,
  InlineReadOnly,
  InlineSelect,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { useCollectionAccess } from '@/lib/permissions'
import { PageHeader } from '@/components/page-header'
import { RecordMenu } from '@/components/record-menu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { appCopy } from '@/lib/app.copy'
import { todayInput } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  affiliationSpan,
  groupAffiliations,
  groupTenure,
  groupTitle,
} from '@/modules/crm/affiliations'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { AttachmentsPanel, useAttachFiles } from '@/modules/crm/components/attachments'
import { AffiliationCard } from '@/modules/crm/components/affiliation-card'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import { ContactAvatar, OrganizationLabel } from '@/modules/crm/components/entities'
import { AffiliationDrawer } from '@/modules/crm/components/affiliation-form'
import type { AffiliationInitial } from '@/modules/crm/components/affiliation-form'
import { InlineOwner } from '@/components/inline/inline-owner'
import { contactPanels } from '@/modules/organization-panels'
import { OrganizationDrawer } from '@/modules/crm/components/organization-form'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { DealIcon, OrganizationIcon } from '@/modules/crm/icons'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
} from '@/modules/crm/entity-options'
import { contactDetailQuery } from '@/modules/crm/data'
import {
  useDeleteAffiliation,
  useDeleteContact,
  useUpdateAffiliation,
  useUpdateContact,
} from '@/modules/crm/mutations'
import { uuidParam } from '@/lib/uuid'

const contactStatuses = [
  { value: 'active', label: crmCopy.contacts.statuses.active },
  { value: 'former', label: crmCopy.contacts.statuses.former },
]

export const Route = createFileRoute('/_app/crm/contacts_/$contactId')({
  params: { parse: ({ contactId }) => ({ contactId: uuidParam(contactId) }) },
  staticData: {
    page: { title: crmCopy.contacts.singular, module: 'crm', parent: '/crm/contacts' },
  },
  loader: async ({ context: { queryClient }, params }) => {
    try {
      await queryClient.ensureQueryData(contactDetailQuery(params.contactId))
    } catch (error) {
      if (error instanceof MonospaceNotFoundError) {
        throw notFound()
      }

      throw error
    }
  },
  component: ContactDetailPage,
})

function ContactDetailPage() {
  const { contactId } = Route.useParams()
  const navigate = useNavigate()
  const contactQuery = useQuery(contactDetailQuery(contactId))
  const access = useCollectionAccess('contacts')
  const affiliationAccess = useCollectionAccess('contactOrganizations')
  const dealAccess = useCollectionAccess('opportunities')

  const history = useQueries({
    queries: contactPanels.map((panel) => panel.historyQuery({ email: contactQuery.data?.email })),
  })

  const remove = useDeleteContact()
  const update = useUpdateContact()
  const attach = useAttachFiles()
  const updateNotes = useUpdateContact({ notify: false })
  const updateAffiliation = useUpdateAffiliation()
  const removeAffiliation = useDeleteAffiliation()
  const [deleting, setDeleting] = useState(false)
  const [addingDeal, setAddingDeal] = useState(false)
  const [addingOrganization, setAddingOrganization] = useState<'new' | 'existing'>()
  const [now] = useState(() => Date.now())
  const [editingAffiliation, setEditingAffiliation] = useState<AffiliationInitial>()
  const [removingAffiliation, setRemovingAffiliation] = useState<AffiliationInitial>()

  if (contactQuery.isError && contactQuery.error instanceof MonospaceNotFoundError) {
    throw notFound()
  }

  if (contactQuery.isPending) {
    return <DataLoading rows={8} />
  }

  if (contactQuery.isError) {
    return <DataError error={contactQuery.error} />
  }

  const contact = contactQuery.data
  const affiliations = contact.contact_organizations?.data ?? []
  const interactions = contact.interactions?.data ?? []
  const extraEntries = history.flatMap((query) => query.data ?? [])
  const name = `${contact.firstName ?? crmCopy.contacts.restrictedName.first} ${contact.lastName ?? crmCopy.contacts.restrictedName.last}`
  const groups = groupAffiliations(affiliations, (row) => row.organizations?.id)
  const primaryAffiliation = groups.find((group) => group.isPrimary)?.current

  const organizationOptions = groups.flatMap((group) => {
    const option = toOrganizationOption(group.current?.organizations)

    return option ? [option] : []
  })

  const activityOrganization = organizationOptions.length === 1 ? organizationOptions[0] : undefined

  const toInitial = (row: (typeof affiliations)[number]): AffiliationInitial => ({
    id: row.id,
    organization: toOrganizationOption(row.organizations),
    title: row.title,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    isPrimary: row.isPrimary,
  })

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id: contactId, data })
  }

  const contactOption = toContactOption({ ...contact, id: contactId })

  const primaryOrganization = toOrganizationOption(primaryAffiliation?.organizations) ?? undefined
  // Files roll up to an organization, so a contact needs one to attach anything.
  const attachOrganization = primaryOrganization ?? activityOrganization

  const attachTarget = attachOrganization
    ? { organizationId: attachOrganization.value, contactId: contact.id ?? contactId }
    : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        avatar={<ContactAvatar contact={contact} className="md:size-10" />}
        title={
          <InlineReadOnly value={!access.canUpdate('firstName') || !access.canUpdate('lastName')}>
            <InlineName
              firstName={contact.firstName}
              lastName={contact.lastName}
              labels={{
                first: crmCopy.contacts.form.firstName,
                last: crmCopy.contacts.form.lastName,
                name: crmCopy.contacts.form.name,
              }}
              displayClassName={cn(
                'text-xl font-semibold tracking-tight md:text-2xl',
                HEADING_WRAP,
              )}
              inputClassName="h-8 py-0 text-xl leading-8 font-semibold tracking-tight md:text-2xl"
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
              {attachTarget ? (
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
        contactId={contact.id ?? contactId}
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
          <Frame dense>
            <FrameHeader className="flex-row items-center px-5 py-3">
              <FrameTitle>{crmCopy.contacts.details}</FrameTitle>
            </FrameHeader>
            <FramePanel className="px-5 py-4">
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
                    options={contactStatuses}
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
            </FramePanel>
          </Frame>

          <Frame stacked dense>
            <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
              <FrameTitle>{crmCopy.organizations.title}</FrameTitle>
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
                  <DropdownMenuItem onClick={() => setAddingOrganization('new')}>
                    <OrganizationIcon />
                    {crmCopy.contacts.affiliations.newOrganization}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddingOrganization('existing')}>
                    <Link2 />
                    {crmCopy.contacts.affiliations.link}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </FrameHeader>
            {groups.length ? (
              groups.map((group) => {
                const organization = group.roles[0]?.organizations

                if (!organization?.id) return null

                return (
                  <AffiliationCard
                    key={group.key}
                    group={group}
                    label={
                      <OrganizationLabel
                        organization={organization}
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
                    }
                    onEdit={(row) => setEditingAffiliation(toInitial(row))}
                    onEnd={(row) =>
                      updateAffiliation.mutate({
                        id: row.id ?? '',
                        data: { endedAt: todayInput(), isPrimary: false },
                      })
                    }
                    onDelete={(row) => {
                      removeAffiliation.reset()
                      setRemovingAffiliation(toInitial(row))
                    }}
                  />
                )
              })
            ) : (
              <FramePanel className="px-5 py-4">
                <p className="text-sm text-muted-foreground">{crmCopy.contacts.noAffiliations}</p>
              </FramePanel>
            )}
          </Frame>
        </div>

        <Tabs defaultValue="activity" className="min-w-0 gap-5">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="activity">{crmCopy.activity.title}</TabsTrigger>
            <TabsTrigger value="notes">{crmCopy.notes.title}</TabsTrigger>
            <TabsTrigger value="files">{crmCopy.files.title}</TabsTrigger>
            {contactPanels.map((panel) => (
              <TabsTrigger key={panel.id} value={panel.id}>
                {panel.title}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="activity">
            <RecordActivity
              interactions={interactions}
              extraEntries={extraEntries}
              defaults={{
                contact: contactOption,
                organization: activityOrganization,
                organizationOptions,
              }}
              emptyMessage={crmCopy.contacts.noActivity}
              hide={['contact']}
            />
          </TabsContent>
          <TabsContent value="files">
            {attachTarget ? (
              <AttachmentsPanel
                scope={{ contactId }}
                target={attachTarget}
                hide={['contact']}
                emptyMessage={crmCopy.files.noFiles(crmCopy.contacts.singular)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{crmCopy.files.needsOrganization}</p>
            )}
          </TabsContent>
          <TabsContent value="notes">
            <NotesEditor
              key={contact.id}
              value={contact.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({ id: contact.id ?? contactId, data: { notes } })
              }}
            />
          </TabsContent>
          {contactPanels.map(({ id, component: Panel }) => (
            <TabsContent key={id} value={id}>
              <SectionBoundary resetKey={contactId}>
                <Panel email={contact.email} />
              </SectionBoundary>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {editingAffiliation ? (
        <AffiliationDrawer
          key={editingAffiliation.id}
          contactId={contact.id ?? contactId}
          initial={editingAffiliation}
          open
          onOpenChange={(open) => !open && setEditingAffiliation(undefined)}
        />
      ) : null}
      <DeleteDialog
        open={Boolean(removingAffiliation)}
        onOpenChange={(open) => !open && setRemovingAffiliation(undefined)}
        noun={crmCopy.contacts.affiliations.singular}
        name={removingAffiliation?.organization?.label ?? crmCopy.organizations.restricted}
        pending={removeAffiliation.isPending}
        error={
          removeAffiliation.isError
            ? errorMessage(removeAffiliation.error, appCopy.form.deleteFailed)
            : undefined
        }
        onConfirm={() => {
          if (!removingAffiliation) return
          removeAffiliation.mutate(removingAffiliation.id, {
            onSuccess: () => setRemovingAffiliation(undefined),
          })
        }}
      />
      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        noun={crmCopy.contacts.singular}
        name={name}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          remove.mutate(contact.id ?? contactId, {
            onSuccess: () => navigate({ to: '/crm/contacts' }),
          })
        }
      />
    </div>
  )
}
