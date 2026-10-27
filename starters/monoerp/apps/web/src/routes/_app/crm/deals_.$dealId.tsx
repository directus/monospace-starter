import { MonospaceNotFoundError } from '@monospace/sdk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading, SectionBoundary } from '@/components/data-state'
import { requiredText } from '@/components/form/validators'
import {
  InlineMoney,
  InlineReadOnly,
  InlineRelation,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { InlineOwner } from '@/components/inline/inline-owner'
import { NotesEditor } from '@/components/notes-editor'
import { PageHeader } from '@/components/page-header'
import { RecordDetails } from '@/components/record-details'
import { RecordTitle } from '@/components/record-title'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { ensureOrNotFound } from '@/lib/route-loaders'
import { uuidParam } from '@/lib/uuid'
import { CloseDealDialog } from '@/modules/crm/components/close-deal-dialog'
import { DealActions } from '@/modules/crm/components/deal-actions'
import { DEAL_CURRENCIES } from '@/modules/crm/components/deal-form'
import { ContactLabel, OrganizationLabel } from '@/modules/crm/components/entities'
import { AttachmentsPanel } from '@/modules/crm/components/files/panel'
import { useAttachFiles } from '@/modules/crm/components/files/uploads'
import { RecordActivity } from '@/modules/crm/components/record-activity'
import { RecordTabs } from '@/modules/crm/components/record-tabs'
import { StageStepper } from '@/modules/crm/components/stage-stepper'
import { StatusBadge } from '@/modules/crm/components/status-badge'
import { crmCopy } from '@/modules/crm/crm.copy'
import {
  lookupContacts,
  lookupOrganizations,
  dealDetailQuery,
  pipelineStagesQuery,
} from '@/modules/crm/data'
import type { PipelineStage } from '@/modules/crm/data'
import { statusForStage } from '@/modules/crm/deals'
import {
  contactOption as toContactOption,
  organizationOption as toOrganizationOption,
} from '@/modules/crm/entities'
import { useCloseDeal, useDeleteDeal, useUpdateDeal } from '@/modules/crm/mutations'
import { dealSummaries } from '@/modules/crm/slots'

export const Route = createFileRoute('/_app/crm/deals_/$dealId')({
  params: { parse: ({ dealId }) => ({ dealId: uuidParam(dealId) }) },
  staticData: {
    page: { title: crmCopy.deals.singular, module: 'crm', parent: '/crm/deals' },
  },
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      ensureOrNotFound(queryClient, dealDetailQuery(params.dealId)),
      ensureOrNotFound(queryClient, pipelineStagesQuery()),
    ])
  },
  component: DealDetailPage,
})

function DealDetailPage() {
  const { dealId } = Route.useParams()
  const navigate = useNavigate()
  const dealQuery = useQuery(dealDetailQuery(dealId))
  const access = useCollectionAccess('deals')
  const stages = useQuery(pipelineStagesQuery())
  const update = useUpdateDeal()
  const attachmentAccess = useCollectionAccess('attachments')
  const attach = useAttachFiles()
  const close = useCloseDeal()
  const updateNotes = useUpdateDeal({ notify: false })
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
  const title = deal.title ?? crmCopy.deals.restricted
  const organization = toOrganizationOption(deal.organizations)

  // Every file belongs to an organization, so without a readable one there's nowhere to attach.
  const attachTarget = deal.organizationId
    ? { organizationId: deal.organizationId, contactId: deal.contactId, dealId: dealId }
    : undefined

  const contact = toContactOption(deal.contacts)
  const dealOption = { value: dealId, label: title }
  const activities = deal.activities?.data ?? []

  const save = async (data: Parameters<typeof update.mutateAsync>[0]['data']) => {
    await update.mutateAsync({ id: dealId, data })
  }

  function selectStage(stage: PipelineStage) {
    if (stage.isClosed) {
      close.reset()
      setClosingStage(stage)

      return
    }

    setPendingStageId(stage.id)
    update.mutate(
      { id: dealId, data: { stageId: stage.id, status: statusForStage(stage) } },
      { onSettled: () => setPendingStageId(undefined) },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <InlineReadOnly value={!access.canUpdate('title')}>
            <RecordTitle
              label={crmCopy.deals.form.title}
              value={deal.title}
              validate={requiredText(crmCopy.deals.form.title)}

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
                {attachTarget && attachmentAccess.create ? (
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
          <RecordDetails title={crmCopy.deals.properties}>
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
                    <Summary organization={deal.organizations} />
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
          </RecordDetails>
        </div>

        <RecordTabs
          activity={
            <RecordActivity
              activities={activities}
              defaults={{ organization: organization ?? undefined, deal: dealOption }}
              emptyMessage={crmCopy.deals.noActivity}
              hide={['deal', 'organization']}
            />
          }
          notes={
            <NotesEditor
              readOnly={!access.canUpdate('notes')}
              key={dealId}
              value={deal.notes}
              onSave={async (notes) => {
                await updateNotes.mutateAsync({ id: dealId, data: { notes } })
              }}
            />
          }
          files={
            <AttachmentsPanel
              scope={{ dealId: dealId }}
              target={attachTarget}
              hide={['deal', 'organization']}
              emptyMessage={crmCopy.files.noFiles(crmCopy.deals.singular)}
            />
          }
        />
      </div>

      {closingStage ? (
        <CloseDealDialog
          key={closingStage.id}
          stage={closingStage}
          valueAmount={deal.valueAmount}
          currency={deal.currency ?? 'USD'}
          expectedCloseDate={deal.expectedCloseDate}
          pending={close.isPending}
          error={close.isError ? errorMessage(close.error) : undefined}
          onOpenChange={(open) => !open && setClosingStage(undefined)}
          onConfirm={async ({ valueAmount, closeDate, notes }) => {
            if (!closingStage.id) return

            await close.mutateAsync({
              id: dealId,
              organizationId: deal.organizationId,
              stage: closingStage,
              valueAmount,
              currency: deal.currency ?? 'USD',
              closeDate,
              notes,
            })
            setClosingStage(undefined)
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
        onConfirm={() => remove.mutate(dealId, { onSuccess: () => navigate({ to: '/crm/deals' }) })}
      />
    </div>
  )
}
