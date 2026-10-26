import { MonospaceNotFoundError } from '@monospace/sdk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DeleteDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading, SectionBoundary } from '@/components/data-state'
import { NotesEditor } from '@/components/notes-editor'
import { requiredText } from '@/components/form/validators'
import {
  HEADING_WRAP,
  InlineMoney,
  InlineReadOnly,
  InlineRelation,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { useCollectionAccess } from '@/lib/permissions'
import { PageHeader } from '@/components/page-header'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { AttachmentsPanel, useAttachFiles } from '@/modules/crm/components/attachments'
import { CloseDealDialog } from '@/modules/crm/components/close-deal-dialog'
import { DealActions } from '@/modules/crm/components/deal-actions'
import { ContactLabel, OrganizationLabel } from '@/modules/crm/components/entities'
import { DEAL_CURRENCIES } from '@/modules/crm/components/deal-form'
import { InlineOwner } from '@/components/inline/inline-owner'
import { StageStepper } from '@/modules/crm/components/stage-stepper'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import { dealSummaries } from '@/modules/organization-panels'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
} from '@/modules/crm/entity-options'
import {
  lookupContacts,
  lookupOrganizations,
  opportunityDetailQuery,
  pipelineStagesQuery,
} from '@/modules/crm/data'
import type { PipelineStage } from '@/modules/crm/data'
import { useCreateActivity, useDeleteDeal, useUpdateDeal } from '@/modules/crm/mutations'
import { uuidParam } from '@/lib/uuid'

export const Route = createFileRoute('/_app/crm/deals_/$dealId')({
  params: { parse: ({ dealId }) => ({ dealId: uuidParam(dealId) }) },
  staticData: {
    page: { title: crmCopy.deals.singular, module: 'crm', parent: '/crm/deals' },
  },
  loader: async ({ context: { queryClient }, params }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData(opportunityDetailQuery(params.dealId)),
        queryClient.ensureQueryData(pipelineStagesQuery()),
      ])
    } catch (error) {
      if (error instanceof MonospaceNotFoundError) {
        throw notFound()
      }

      throw error
    }
  },
  component: DealDetailPage,
})

function statusForStage(stage: PipelineStage) {
  return stage.isWon ? 'won' : stage.isClosed ? 'lost' : 'open'
}

function DealDetailPage() {
  const { dealId } = Route.useParams()
  const navigate = useNavigate()
  const dealQuery = useQuery(opportunityDetailQuery(dealId))
  const access = useCollectionAccess('opportunities')
  const stages = useQuery(pipelineStagesQuery())
  const update = useUpdateDeal()
  const attach = useAttachFiles()
  const close = useUpdateDeal({ notify: false })
  const updateNotes = useUpdateDeal({ notify: false })
  const closeNote = useCreateActivity({ notify: false })
  const remove = useDeleteDeal()
  const [deleting, setDeleting] = useState(false)
  const [pendingStageId, setPendingStageId] = useState<Uuid>()
  const [closingStage, setClosingStage] = useState<PipelineStage>()

  if (dealQuery.isError && dealQuery.error instanceof MonospaceNotFoundError) {
    throw notFound()
  }

  if (dealQuery.isPending) {
    return <DataLoading rows={8} />
  }

  if (dealQuery.isError) {
    return <DataError error={dealQuery.error} />
  }

  const deal = dealQuery.data
  const id = dealId
  const title = deal.title ?? crmCopy.deals.restricted
  const organization = toOrganizationOption(deal.organizations)

  // Every file belongs to an organization, so without a readable one there's nowhere to attach.
  const attachTarget = deal.organizationId
    ? { organizationId: deal.organizationId, contactId: deal.contactId, opportunityId: id }
    : undefined

  const contact = toContactOption(deal.contacts)
  const dealOption = { value: id, label: title }
  const interactions = deal.interactions?.data ?? []

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id, data })
  }

  function selectStage(stage: PipelineStage) {
    if (stage.isClosed) {
      close.reset()
      setClosingStage(stage)

      return
    }

    setPendingStageId(stage.id)
    update.mutate(
      { id, data: { stageId: stage.id, status: statusForStage(stage) } },
      { onSettled: () => setPendingStageId(undefined) },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <InlineReadOnly value={!access.canUpdate('title')}>
            <InlineText
              label={crmCopy.deals.form.title}
              value={deal.title}
              validate={requiredText(crmCopy.deals.form.title)}
              displayClassName={cn(
                'text-xl font-semibold tracking-tight md:text-2xl',
                HEADING_WRAP,
              )}
              inputClassName="h-8 py-0 text-xl leading-8 font-semibold tracking-tight md:text-2xl"
              onSave={(value) => save({ title: value ?? title })}
            />
          </InlineReadOnly>
        }
        description={organization?.label ?? undefined}
        actions={
          <>
            <StatusBadge status={deal.status ?? 'unknown'} />
            {stages.data ? (
              <DealActions
                stages={stages.data}
                currentStageId={deal.stageId}
                pendingStageId={pendingStageId}
                onSelect={selectStage}
                onDelete={
                  access.delete
                    ? () => {
                        remove.reset()
                        setDeleting(true)
                      }
                    : undefined
                }
              >
                {attachTarget ? (
                  <DropdownMenuItem onClick={() => attach.pick(attachTarget)}>
                    <Paperclip />
                    {crmCopy.files.attach}
                  </DropdownMenuItem>
                ) : null}
              </DealActions>
            ) : null}
          </>
        }
      />
      {attach.input}

      {stages.data ? (
        <StageStepper
          stages={stages.data}
          currentStageId={deal.stageId}
          pendingStageId={pendingStageId}
          onSelect={selectStage}
        />
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Frame dense>
            <FrameHeader className="flex-row items-center px-5 py-3">
              <FrameTitle>{crmCopy.deals.properties}</FrameTitle>
            </FrameHeader>
            <FramePanel className="px-5 py-4">
              <PropertyList>
                <Property
                  label={crmCopy.deals.organization}
                  readOnly={!access.canUpdate('organizationId')}
                >
                  <InlineRelation
                    label={crmCopy.deals.organization}
                    value={organization}
                    search={lookupOrganizations}
                    clearable={false}
                    render={() => (
                      <OrganizationLabel
                        organization={deal.organizations}
                        size="sm"
                        className="[&_a]:contents"
                      />
                    )}
                    onSave={(option) =>
                      option
                        ? save({ organizationId: option.value, contactId: null })
                        : Promise.resolve()
                    }
                  />
                </Property>
                {dealSummaries.map(({ id, title, component: Summary }) => (
                  <Property key={id} label={title}>
                    <SectionBoundary resetKey={dealId}>
                      <Summary portalAccountId={deal.organizations?.portalAccountId ?? null} />
                    </SectionBoundary>
                  </Property>
                ))}
                <Property label={crmCopy.deals.contact} readOnly={!access.canUpdate('contactId')}>
                  <InlineRelation
                    label={crmCopy.deals.contact}
                    value={contact}
                    search={(query) => lookupContacts(query, organization?.value)}
                    emptyLabel={appCopy.inline.assign}
                    render={() => <ContactLabel contact={deal.contacts} size="sm" />}
                    onSave={(option) => save({ contactId: option?.value ?? null })}
                  />
                </Property>
                <Property label={crmCopy.deals.value} readOnly={!access.canUpdate('valueAmount')}>
                  <InlineMoney
                    label={crmCopy.deals.value}
                    amount={deal.valueAmount}
                    currency={deal.currency ?? 'USD'}
                    currencies={DEAL_CURRENCIES}
                    format={(amount, currency) => formatMoney(amount, currency)}
                    onSave={({ amount, currency }) => save({ valueAmount: amount, currency })}
                  />
                </Property>
                <Property
                  label={crmCopy.deals.expectedClose}
                  readOnly={!access.canUpdate('expectedCloseDate')}
                >
                  <InlineText
                    label={crmCopy.deals.expectedClose}
                    type="date"
                    value={deal.expectedCloseDate}
                    emptyLabel={appCopy.inline.set(crmCopy.deals.expectedClose)}
                    format={(value) => formatDate(value)}
                    onSave={(value) => save({ expectedCloseDate: value })}
                  />
                </Property>
                <Property label={appCopy.common.owner} readOnly={!access.canUpdate('ownerUserId')}>
                  <InlineOwner owner={deal.owner} onSave={(ownerUserId) => save({ ownerUserId })} />
                </Property>
              </PropertyList>
              <p className="mt-3 text-xs text-muted-foreground">
                {crmCopy.deals.timestamps(formatDate(deal.createdAt), formatDate(deal.updatedAt))}
              </p>
            </FramePanel>
          </Frame>
        </div>

        <Tabs defaultValue="activity" className="min-w-0 gap-5">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="activity">{crmCopy.activity.title}</TabsTrigger>
            <TabsTrigger value="notes">{crmCopy.notes.title}</TabsTrigger>
            <TabsTrigger value="files">{crmCopy.files.title}</TabsTrigger>
          </TabsList>
          <TabsContent value="activity">
            <RecordActivity
              interactions={interactions}
              defaults={{ organization: organization ?? undefined, deal: dealOption }}
              emptyMessage={crmCopy.deals.noActivity}
              hide={['deal', 'organization']}
            />
          </TabsContent>
          <TabsContent value="files">
            <AttachmentsPanel
              scope={{ opportunityId: id }}
              target={attachTarget}
              hide={['deal', 'organization']}
              emptyMessage={crmCopy.files.noFiles(crmCopy.deals.singular)}
            />
          </TabsContent>
          <TabsContent value="notes">
            <NotesEditor
              key={id}
              value={deal.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({ id, data: { notes } })
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {closingStage ? (
        <CloseDealDialog
          key={closingStage.id}
          stage={closingStage}
          valueAmount={deal.valueAmount}
          currency={deal.currency ?? 'USD'}
          expectedCloseDate={deal.expectedCloseDate}
          pending={close.isPending || closeNote.isPending}
          error={
            close.isError
              ? errorMessage(close.error)
              : closeNote.isError
                ? errorMessage(closeNote.error)
                : undefined
          }
          onOpenChange={(open) => !open && setClosingStage(undefined)}
          onConfirm={async ({ valueAmount, closeDate, notes }) => {
            if (!closingStage.id) return

            await close.mutateAsync({
              id,
              data: {
                stageId: closingStage.id,
                status: statusForStage(closingStage),
                valueAmount,
                expectedCloseDate: closeDate,
              },
            })

            // An activity needs its organization; a hidden one leaves nowhere to file the note.
            if (notes && deal.organizationId) {
              const occurredAt = new Date().toISOString()
              await closeNote.mutateAsync({
                type: 'note',
                status: 'completed',
                direction: 'internal',
                subject: closingStage.isWon
                  ? crmCopy.deals.close.winNoteSubject
                  : crmCopy.deals.close.lossNoteSubject,
                body: notes,
                occurredAt,
                completedAt: occurredAt,
                dueAt: null,
                organizations: {
                  _connect: { key: { id: deal.organizationId } },
                },
                opportunities: { _connect: { key: { id } } },
              })
            }

            setClosingStage(undefined)

            if (closingStage.isWon) {
              toast.success(
                crmCopy.deals.close.wonToast(formatMoney(valueAmount, deal.currency ?? undefined)),
              )
            } else {
              toast(crmCopy.deals.close.lostToast)
            }
          }}
        />
      ) : null}

      <DeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        noun={crmCopy.deals.singular}
        name={title}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => remove.mutate(id, { onSuccess: () => navigate({ to: '/crm/deals' }) })}
      />
    </div>
  )
}
