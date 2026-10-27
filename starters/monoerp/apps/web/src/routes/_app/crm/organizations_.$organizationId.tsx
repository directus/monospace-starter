import { noop, useQueries, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ExternalLink, Link2, Paperclip, Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { SectionBoundary } from '@/components/data-state'
import { optionalDomain, requiredText } from '@/components/form/validators'
import {
  InlineSelect,
  InlineReadOnly,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { InlineOwner } from '@/components/inline/inline-owner'
import { NotesEditor } from '@/components/notes-editor'
import { PageHeader } from '@/components/page-header'
import { RecordDetails } from '@/components/record-details'
import { RecordMenu } from '@/components/record-menu'
import { RecordTitle } from '@/components/record-title'
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
import { groupAffiliations, groupTitle, isCurrentAffiliation } from '@/modules/crm/affiliations'
import { AffiliationDrawer } from '@/modules/crm/components/affiliation-form'
import type { AffiliationInitial } from '@/modules/crm/components/affiliation-form'
import { AffiliationsPanel } from '@/modules/crm/components/affiliations-panel'
import { ContactDrawer } from '@/modules/crm/components/contact-form'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import { DealsPanel } from '@/modules/crm/components/deals-panel'
import { ContactLabel, OrganizationAvatar } from '@/modules/crm/components/entities'
import { AttachmentsPanel } from '@/modules/crm/components/files/panel'
import { useAttachFiles } from '@/modules/crm/components/files/uploads'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { RecordTabs } from '@/modules/crm/components/record-tabs'
import { crmCopy } from '@/modules/crm/crm.copy'
import { attachmentsQuery, organizationDetailQuery } from '@/modules/crm/data'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
  organizationStatusOptions,
} from '@/modules/crm/entities'
import { useDeleteOrganization, useUpdateOrganization } from '@/modules/crm/mutations'
import { organizationPanels } from '@/modules/crm/slots'

export const Route = createFileRoute('/_app/crm/organizations_/$organizationId')({
  params: { parse: ({ organizationId }) => ({ organizationId: uuidParam(organizationId) }) },
  staticData: {
    page: { title: crmCopy.organizations.singular, module: 'crm', parent: '/crm/organizations' },
  },
  loader: async ({ context: { queryClient }, params: { organizationId } }) => {
    const organization = await ensureOrNotFound(
      queryClient,
      organizationDetailQuery(organizationId),
    )

    for (const panel of organizationPanels) panel.prefetch?.(queryClient, { organization })
    void queryClient.query(attachmentsQuery({ organizationId })).catch(noop)
  },
  component: OrganizationDetailPage,
})

function OrganizationDetailPage() {
  const { organizationId } = Route.useParams()
  const navigate = useNavigate()
  const detail = useSuspenseQuery(organizationDetailQuery(organizationId))
  const access = useCollectionAccess('organizations')
  const dealAccess = useCollectionAccess('deals')
  const affiliationAccess = useCollectionAccess('affiliations')
  const contactAccess = useCollectionAccess('contacts')

  const history = useQueries({
    queries: organizationPanels.flatMap((panel) =>
      panel.historyQuery ? [panel.historyQuery({ organization: detail.data })] : [],
    ),
  })

  const remove = useDeleteOrganization()
  const update = useUpdateOrganization()
  const updateNotes = useUpdateOrganization({ notify: false })
  const [deleting, setDeleting] = useState(false)
  const attachmentAccess = useCollectionAccess('attachments')
  const attach = useAttachFiles()
  const [addingContact, setAddingContact] = useState<'new' | 'existing'>()

  const [addingSourceContact, setAddingSourceContact] = useState<{
    name?: string | null
    email?: string | null
  }>()

  const organization = detail.data
  const extraEntries = history.flatMap((query) => query.data ?? [])
  const affiliations = organization.affiliations?.data ?? []

  const groups = groupAffiliations(
    affiliations.filter(isCurrentAffiliation),
    (row) => row.contact?.id,
  )

  const deals = organization.deals?.data ?? []
  const activities = organization.activities?.data ?? []
  const organizationName = organization.name ?? crmCopy.organizations.restricted

  const organizationOption = toOrganizationOption({ ...organization, id: organizationId })

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id: organizationId, data })
  }

  const toInitial = (row: (typeof affiliations)[number]): AffiliationInitial => ({
    id: row.id,
    organization: organizationOption,
    contact: toContactOption(row.contact),
    title: row.title,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    isPrimary: row.isPrimary,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        avatar={<OrganizationAvatar organization={organization} className="md:size-10" />}
        title={
          <InlineReadOnly value={!access.canUpdate('name')}>
            <RecordTitle
              label={crmCopy.organizations.form.name}
              value={organization.name}
              validate={requiredText(crmCopy.organizations.form.name)}
              onSave={(value) => save({ name: value ?? organizationName })}
            />
          </InlineReadOnly>
        }
        description={
          organization.domain ? (
            <a
              href={`https://${organization.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {organization.domain}
              <ArrowUpRight className="size-3.5" />
            </a>
          ) : undefined
        }
        actions={
          <>
            {dealAccess.create ? (
              <DealDrawer
                defaultOrganization={organizationOption}
                trigger={
                  <Button variant="outline">
                    <Plus data-icon="inline-start" />
                    {appCopy.form.add(crmCopy.deals.singular)}
                  </Button>
                }
              />
            ) : null}
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
              {attachmentAccess.create ? (
                <DropdownMenuItem onClick={() => attach.pick({ organizationId })}>
                  <Paperclip />
                  {crmCopy.files.attach}
                </DropdownMenuItem>
              ) : null}
            </RecordMenu>
          </>
        }
      />
      {attach.input}

      {/* Below lg the sidebar dissolves into the grid so the tabs sit right under Details and
          the contact and deal lists drop to the bottom instead of pushing the tabs off screen. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="max-lg:contents lg:space-y-4">
          <RecordDetails title={crmCopy.organizations.details}>
            <PropertyList>
              <Property
                label={crmCopy.organizations.industry}
                readOnly={!access.canUpdate('industry')}
              >
                <InlineText
                  label={crmCopy.organizations.industry}
                  value={organization.industry}
                  onSave={(value) => save({ industry: value })}
                />
              </Property>
              <Property label={crmCopy.organizations.domain} readOnly={!access.canUpdate('domain')}>
                <InlineText
                  label={crmCopy.organizations.domain}
                  type="url"
                  value={organization.domain}
                  validate={optionalDomain}
                  format={(value) => (
                    <a
                      href={`https://${value}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {value}
                    </a>
                  )}
                  action={(value) => (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={crmCopy.organizations.openWebsite}
                      render={<a href={`https://${value}`} target="_blank" rel="noreferrer" />}
                      nativeButton={false}
                    >
                      <ExternalLink />
                    </Button>
                  )}
                  onSave={(value) => save({ domain: value })}
                />
              </Property>
              <Property label={appCopy.common.owner} readOnly={!access.canUpdate('ownerUserId')}>
                <InlineOwner
                  owner={organization.owner}
                  onSave={(ownerUserId) => save({ ownerUserId })}
                />
              </Property>
              {organizationPanels.flatMap(({ id, detailField: Field }) =>
                Field
                  ? [
                      <Field
                        key={id}
                        organization={organization}
                        canUpdate={access.canUpdate}
                        onSave={save}
                      />,
                    ]
                  : [],
              )}
              <Property label={appCopy.common.status} readOnly={!access.canUpdate('status')}>
                <InlineSelect
                  label={appCopy.common.status}
                  value={organization.status}
                  options={organizationStatusOptions}
                  onSave={(value) => save({ status: value })}
                />
              </Property>
              <Property label={appCopy.common.lastUpdated}>
                <span className="text-muted-foreground">{formatDate(organization.updatedAt)}</span>
              </Property>
            </PropertyList>
          </RecordDetails>

          <AffiliationsPanel
            anchor={{ organizationId }}
            groups={groups}
            toInitial={toInitial}
            title={
              <>
                {crmCopy.contacts.title}
                <Count value={groups.length} />
              </>
            }
            actions={
              affiliationAccess.create ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={appCopy.form.add(crmCopy.contacts.singular)}
                      />
                    }
                  >
                    <Plus />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem
                      disabled={!contactAccess.create}
                      onClick={() => setAddingContact('new')}
                    >
                      <UserPlus />
                      {crmCopy.contacts.affiliations.newContact}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setAddingContact('existing')}>
                      <Link2 />
                      {crmCopy.contacts.affiliations.linkContact}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null
            }
            label={(group) => {
              const contact = group.roles[0]?.contact

              return (
                <ContactLabel
                  contact={contact}
                  secondary={groupTitle(group) || contact?.email || undefined}
                />
              )
            }}
            emptyMessage={crmCopy.organizations.noContacts}
            showPrimary={false}
            className="max-lg:order-2"
          />

          <DealsPanel deals={deals} organization={organizationOption} className="max-lg:order-2" />
        </div>

        <RecordTabs
          activity={
            <RecordActivity
              activities={activities}
              extraEntries={extraEntries}
              defaults={{ organization: organizationOption }}
              emptyMessage={crmCopy.organizations.noActivity}
              hide={['organization']}
            />
          }
          notes={
            <NotesEditor
              readOnly={!access.canUpdate('notes')}
              key={organization.id}
              value={organization.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({
                  id: organization.id,
                  data: { notes },
                })
              }}
            />
          }
          files={
            <AttachmentsPanel
              scope={{ organizationId }}
              target={{ organizationId }}
              hide={['organization']}
              emptyMessage={crmCopy.files.noFiles(crmCopy.organizations.singular)}
            />
          }
          extra={organizationPanels.map(({ id, title, component: Panel }) => ({
            id,
            title,
            content: (
              <SectionBoundary resetKey={organizationId}>
                <Panel
                  organization={organization}
                  onAddContact={
                    contactAccess.create && affiliationAccess.create
                      ? setAddingSourceContact
                      : undefined
                  }
                />
              </SectionBoundary>
            ),
          }))}
          className="max-lg:order-1"
        />
      </div>

      <ContactDrawer
        defaultOrganization={organizationOption}
        open={addingContact === 'new'}
        onOpenChange={(open) => !open && setAddingContact(undefined)}
      />
      {addingSourceContact ? (
        <ContactDrawer
          key={addingSourceContact.email}
          defaultOrganization={organizationOption}
          initial={{
            ...splitName(addingSourceContact.name),
            email: addingSourceContact.email ?? undefined,
          }}
          open
          onOpenChange={(open) => !open && setAddingSourceContact(undefined)}
        />
      ) : null}
      <AffiliationDrawer
        organizationId={organization.id}
        open={addingContact === 'existing'}
        onOpenChange={(open) => !open && setAddingContact(undefined)}
      />
      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        noun={crmCopy.organizations.singular}
        name={organizationName}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          remove.mutate(organization.id, {
            onSuccess: () => navigate({ to: '/crm/organizations' }),
          })
        }
      />
    </div>
  )
}

function Count({ value }: { value: number }) {
  return (
    <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground tabular-nums">
      {value}
    </span>
  )
}

// External people may have one name field. Last word is the surname, which is right often enough for
// a prefilled form the user is about to review.
function splitName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)

  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' }

  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' }
}
