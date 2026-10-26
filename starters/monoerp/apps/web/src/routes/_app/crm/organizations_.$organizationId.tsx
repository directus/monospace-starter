import { MonospaceNotFoundError } from '@monospace/sdk'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ExternalLink, Link2, Paperclip, Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading, SectionBoundary } from '@/components/data-state'
import { NotesEditor } from '@/components/notes-editor'
import { optionalDomain, requiredText } from '@/components/form/validators'
import {
  HEADING_WRAP,
  InlineSelect,
  InlineReadOnly,
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
import { errorMessage } from '@/lib/errors'
import { todayInput } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { groupAffiliations, groupTitle, isCurrentAffiliation } from '@/modules/crm/affiliations'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { AttachmentsPanel, useAttachFiles } from '@/modules/crm/components/attachments'
import { AffiliationCard } from '@/modules/crm/components/affiliation-card'
import { AffiliationDrawer } from '@/modules/crm/components/affiliation-form'
import type { RelationOption } from '@/components/form/relation-combobox'
import type { AffiliationInitial } from '@/modules/crm/components/affiliation-form'
import { ContactLabel, OrganizationAvatar } from '@/modules/crm/components/entities'
import { ContactDrawer } from '@/modules/crm/components/contact-form'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import { InlineOwner } from '@/components/inline/inline-owner'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { crmCopy } from '@/modules/crm/crm.copy'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
} from '@/modules/crm/entity-options'
import { organizationDetailQuery } from '@/modules/crm/data'
import type { OrganizationDetail } from '@/modules/crm/data'
import {
  useDeleteAffiliation,
  useDeleteOrganization,
  useUpdateAffiliation,
  useUpdateOrganization,
} from '@/modules/crm/mutations'
import { organizationPanels } from '@/modules/organization-panels'
import { uuidParam } from '@/lib/uuid'

const organizationStatuses = [
  { value: 'prospect', label: crmCopy.organizations.statuses.prospect },
  { value: 'active', label: crmCopy.organizations.statuses.active },
  { value: 'inactive', label: crmCopy.organizations.statuses.inactive },
]

export const Route = createFileRoute('/_app/crm/organizations_/$organizationId')({
  params: { parse: ({ organizationId }) => ({ organizationId: uuidParam(organizationId) }) },
  staticData: {
    page: { title: crmCopy.organizations.singular, module: 'crm', parent: '/crm/organizations' },
  },
  loader: async ({ context: { queryClient }, params }) => {
    try {
      await queryClient.ensureQueryData(organizationDetailQuery(params.organizationId))
    } catch (error) {
      if (error instanceof MonospaceNotFoundError) {
        throw notFound()
      }

      throw error
    }
  },
  component: OrganizationDetailPage,
})

function OrganizationDetailPage() {
  const { organizationId } = Route.useParams()
  const navigate = useNavigate()
  const detail = useQuery(organizationDetailQuery(organizationId))
  const access = useCollectionAccess('organizations')
  const dealAccess = useCollectionAccess('opportunities')

  const history = useQueries({
    queries: organizationPanels.flatMap((panel) =>
      panel.historyQuery
        ? [panel.historyQuery({ portalAccountId: detail.data?.portalAccountId ?? null })]
        : [],
    ),
  })

  const remove = useDeleteOrganization()
  const update = useUpdateOrganization()
  const updateNotes = useUpdateOrganization({ notify: false })
  const updateAffiliation = useUpdateAffiliation()
  const removeAffiliation = useDeleteAffiliation()
  const [deleting, setDeleting] = useState(false)
  const attach = useAttachFiles()
  const [addingContact, setAddingContact] = useState<'new' | 'existing'>()

  const [addingSourceContact, setAddingSourceContact] = useState<{
    name?: string | null
    email?: string | null
  }>()

  const [editingAffiliation, setEditingAffiliation] = useState<AffiliationInitial>()
  const [removingAffiliation, setRemovingAffiliation] = useState<AffiliationInitial>()

  if (detail.isError && detail.error instanceof MonospaceNotFoundError) {
    throw notFound()
  }

  if (detail.isPending) {
    return <DataLoading rows={8} />
  }

  if (detail.isError) {
    return <DataError error={detail.error} />
  }

  const organization = detail.data
  const extraEntries = history.flatMap((query) => query.data ?? [])
  const affiliations = organization.contact_organizations?.data ?? []

  const groups = groupAffiliations(
    affiliations.filter(isCurrentAffiliation),
    (row) => row.contacts?.id,
  )

  const deals = organization.opportunities?.data ?? []
  const interactions = organization.interactions?.data ?? []
  const organizationName = organization.name ?? crmCopy.organizations.restricted

  const organizationOption = toOrganizationOption({ ...organization, id: organizationId })

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id: organizationId, data })
  }

  const toInitial = (row: (typeof affiliations)[number]): AffiliationInitial => ({
    id: row.id,
    organization: organizationOption,
    contact: toContactOption(row.contacts),
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
            <InlineText
              label={crmCopy.organizations.form.name}
              value={organization.name}
              validate={requiredText(crmCopy.organizations.form.name)}
              displayClassName={cn(
                'text-xl font-semibold tracking-tight md:text-2xl',
                HEADING_WRAP,
              )}
              inputClassName="h-8 py-0 text-xl leading-8 font-semibold tracking-tight md:text-2xl"
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
              <DropdownMenuItem onClick={() => attach.pick({ organizationId })}>
                <Paperclip />
                {crmCopy.files.attach}
              </DropdownMenuItem>
            </RecordMenu>
          </>
        }
      />
      {attach.input}

      {/* Below lg the sidebar dissolves into the grid so the tabs sit right under Details and
          the contact and deal lists drop to the bottom instead of pushing the tabs off screen. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="max-lg:contents lg:space-y-4">
          <Frame dense>
            <FrameHeader className="flex-row items-center px-5 py-3">
              <FrameTitle>{crmCopy.organizations.details}</FrameTitle>
            </FrameHeader>
            <FramePanel className="px-5 py-4">
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
                <Property
                  label={crmCopy.organizations.domain}
                  readOnly={!access.canUpdate('domain')}
                >
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
                <Property
                  label={crmCopy.organizations.portalAccountId}
                  readOnly={!access.canUpdate('portalAccountId')}
                >
                  <InlineText
                    label={crmCopy.organizations.portalAccountId}
                    value={organization.portalAccountId}
                    inputClassName="font-mono text-xs"
                    format={(value) => <span className="font-mono text-xs">{value}</span>}
                    onSave={(value) => save({ portalAccountId: value })}
                  />
                </Property>
                <Property label={appCopy.common.status} readOnly={!access.canUpdate('status')}>
                  <InlineSelect
                    label={appCopy.common.status}
                    value={organization.status}
                    options={organizationStatuses}
                    onSave={(value) => save({ status: value })}
                  />
                </Property>
                <Property label={appCopy.common.lastUpdated}>
                  <span className="text-muted-foreground">
                    {formatDate(organization.updatedAt)}
                  </span>
                </Property>
              </PropertyList>
            </FramePanel>
          </Frame>

          <Frame stacked dense className="max-lg:order-2">
            <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
              <FrameTitle>
                {crmCopy.contacts.title}
                <Count value={groups.length} />
              </FrameTitle>
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
                  <DropdownMenuItem onClick={() => setAddingContact('new')}>
                    <UserPlus />
                    {crmCopy.contacts.affiliations.newContact}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddingContact('existing')}>
                    <Link2 />
                    {crmCopy.contacts.affiliations.linkContact}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </FrameHeader>
            {groups.length ? (
              groups.map((group) => {
                const contact = group.roles[0]?.contacts

                if (!contact?.id) return null

                return (
                  <AffiliationCard
                    key={group.key}
                    group={group}
                    showPrimary={false}
                    label={
                      <ContactLabel
                        contact={contact}
                        secondary={groupTitle(group) || contact.email || undefined}
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
                <p className="text-sm text-muted-foreground">{crmCopy.organizations.noContacts}</p>
              </FramePanel>
            )}
          </Frame>

          <DealsPanel deals={deals} organization={organizationOption} className="max-lg:order-2" />
        </div>

        <Tabs defaultValue="activity" className="min-w-0 gap-5 max-lg:order-1">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="activity">{crmCopy.organizations.tabs.activity}</TabsTrigger>
            <TabsTrigger value="notes">{crmCopy.organizations.tabs.notes}</TabsTrigger>
            <TabsTrigger value="files">{crmCopy.files.title}</TabsTrigger>
            {organizationPanels.map((panel) => (
              <TabsTrigger key={panel.id} value={panel.id}>
                {panel.title}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="activity">
            <RecordActivity
              interactions={interactions}
              extraEntries={extraEntries}
              defaults={{ organization: organizationOption }}
              emptyMessage={crmCopy.organizations.noActivity}
              hide={['organization']}
            />
          </TabsContent>
          <TabsContent value="notes">
            <NotesEditor
              key={organization.id}
              value={organization.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({
                  id: organization.id ?? organizationId,
                  data: { notes },
                })
              }}
            />
          </TabsContent>
          <TabsContent value="files">
            <AttachmentsPanel
              scope={{ organizationId }}
              target={{ organizationId }}
              hide={['organization']}
              emptyMessage={crmCopy.files.noFiles(crmCopy.organizations.singular)}
            />
          </TabsContent>
          {organizationPanels.map(({ id, component: Panel }) => (
            <TabsContent key={id} value={id}>
              <SectionBoundary resetKey={organizationId}>
                <Panel
                  portalAccountId={organization.portalAccountId ?? null}
                  onAddContact={setAddingSourceContact}
                />
              </SectionBoundary>
            </TabsContent>
          ))}
        </Tabs>
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
        organizationId={organization.id ?? organizationId}
        open={addingContact === 'existing'}
        onOpenChange={(open) => !open && setAddingContact(undefined)}
      />
      {editingAffiliation ? (
        <AffiliationDrawer
          key={editingAffiliation.id}
          organizationId={organization.id ?? organizationId}
          initial={editingAffiliation}
          open
          onOpenChange={(open) => !open && setEditingAffiliation(undefined)}
        />
      ) : null}
      <DeleteDialog
        open={Boolean(removingAffiliation)}
        onOpenChange={(open) => !open && setRemovingAffiliation(undefined)}
        noun={crmCopy.contacts.affiliations.singular}
        name={removingAffiliation?.contact?.label ?? ''}
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
        noun={crmCopy.organizations.singular}
        name={organizationName}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          remove.mutate(organization.id ?? organizationId, {
            onSuccess: () => navigate({ to: '/crm/organizations' }),
          })
        }
      />
    </div>
  )
}

type Deal = NonNullable<OrganizationDetail['opportunities']>['data'][number]

// Open deals by default, with a quick flip to everything. Each row is the deal at a glance:
// stage dot, value, expected close.
function DealsPanel({
  deals,
  organization,
  className,
}: {
  deals: Array<Deal>
  organization: RelationOption
  className?: string
}) {
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const open = deals.filter((deal) => deal.status === 'open')
  const rows = scope === 'open' ? open : deals
  const copy = crmCopy.organizations.deals

  return (
    <Frame stacked dense className={className}>
      <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
        <FrameTitle className="flex items-center gap-2">
          {crmCopy.deals.title}
          <span className="inline-flex gap-0.5 rounded-md bg-muted p-0.5 text-xs font-normal">
            <ScopeButton active={scope === 'open'} onClick={() => setScope('open')}>
              {copy.open} {open.length}
            </ScopeButton>
            <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
              {copy.all} {deals.length}
            </ScopeButton>
          </span>
        </FrameTitle>
        <DealDrawer
          defaultOrganization={organization}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={appCopy.form.add(crmCopy.deals.singular)}
            >
              <Plus />
            </Button>
          }
        />
      </FrameHeader>
      {rows.length ? (
        rows.map((deal, index) => {
          const stage = deal.pipeline_stages
          const stageName = stage?.name ?? crmCopy.deals.restrictedStage

          const outcome =
            deal.status === 'won'
              ? crmCopy.deals.statuses.won
              : deal.status === 'lost'
                ? crmCopy.deals.statuses.lost
                : null

          return (
            <FramePanel key={deal.id ?? index}>
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  {deal.id ? (
                    <Link
                      to="/crm/deals/$dealId"
                      params={{ dealId: deal.id }}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {deal.title ?? crmCopy.deals.restricted}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">
                      {deal.title ?? crmCopy.deals.restricted}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {stage ? (
                      <StageDot
                        stage={stage}
                        index={index}
                        className={cn('size-2', outcome && 'opacity-40')}
                      />
                    ) : null}
                    <span>{outcome ?? stageName}</span>
                    {deal.expectedCloseDate ? (
                      <span>· {crmCopy.deals.expected(formatDate(deal.expectedCloseDate))}</span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatMoney(deal.valueAmount, deal.currency ?? undefined)}
                </span>
              </div>
            </FramePanel>
          )
        })
      ) : (
        <FramePanel className="px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {scope === 'open' && deals.length
              ? crmCopy.organizations.noOpenDeals
              : crmCopy.organizations.noDeals}
          </p>
        </FramePanel>
      )}
      {deals.length ? (
        <FramePanel className="px-5 py-2">
          <Link
            to="/crm/deals"
            search={{ q: organization.label }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pointer-coarse:min-h-10"
          >
            {copy.viewAll}
            <ArrowUpRight className="size-3" />
          </Link>
        </FramePanel>
      ) : null}
    </Frame>
  )
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-1.5 py-0.5 tabular-nums transition-colors pointer-coarse:px-2.5 pointer-coarse:py-1.5',
        active
          ? 'bg-background text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
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
