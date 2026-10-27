import { useCollectionAccess } from '@/lib/permissions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  attachmentsCreateOneInput,
  contactOrganizationsCreateOneInput,
  contactOrganizationsUpdateOneInput,
  contactsCreateOneInput,
  contactsUpdateOneInput,
  interactionsCreateOneInput,
  interactionsUpdateOneInput,
  opportunitiesCreateOneInput,
  opportunitiesUpdateOneInput,
  organizationsCreateOneInput,
  organizationsUpdateOneInput,
} from '@/generated/monospace'
import {
  attachmentsCreateSchema,
  contactOrganizationsCreateSchema,
  contactOrganizationsUpdateSchema,
  contactsCreateSchema,
  contactsUpdateSchema,
  interactionsCreateSchema,
  interactionsUpdateSchema,
  opportunitiesCreateSchema,
  opportunitiesUpdateSchema,
  organizationsCreateSchema,
  organizationsUpdateSchema,
} from '@/generated/monospace/schemas'
import { formatMoney } from '@/lib/format'
import { statusForStage } from '@/modules/crm/deals'
import type { PipelineStage } from '@/modules/crm/data'
import { appCopy } from '@/lib/app.copy'
import { deleteAsset, uploadAsset } from '@/lib/assets'
import { monospace } from '@/lib/monospace'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentTarget } from '@/modules/crm/data'

import { refreshCrm } from '@/modules/crm/refresh'

function connectTarget(target: AttachmentTarget) {
  return {
    organizations: { _connect: { key: { id: target.organizationId } } },
    contacts: target.contactId ? { _connect: { key: { id: target.contactId } } } : undefined,
    opportunities: target.opportunityId
      ? { _connect: { key: { id: target.opportunityId } } }
      : undefined,
    interactions: target.interactionId
      ? { _connect: { key: { id: target.interactionId } } }
      : undefined,
  }
}

type Update<TData> = { id: Uuid; data: TData }

// Upload the blob, then the row. A row that fails to insert takes its blob with it so nothing
// is left orphaned in storage.
export function useUploadAttachment({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      target,
      signal,
      onProgress,
    }: {
      file: File
      target: AttachmentTarget
      signal?: AbortSignal
      onProgress?: (fraction: number) => void
    }) => {
      const assetId = await uploadAsset(file, { signal, onProgress })

      const input: attachmentsCreateOneInput = {
        assetId: assetId,
        fileName: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
        ...connectTarget(target),
      }

      try {
        return await monospace.attachments.createOne({
          data: attachmentsCreateSchema.parse(input),
          fields: ['id'],
        })
      } catch (error) {
        await deleteAsset(assetId).catch(() => undefined)
        throw error
      }
    },
    onSuccess: async (_result, { file }) => {
      if (notify) toast.success(crmCopy.files.uploaded(file.name))
      // Record pages embed their activities, so refresh those for the paperclip counts.
      await refreshCrm(queryClient, 'attachments')
    },
    onError: (_error, { file }) => {
      toast.error(crmCopy.files.uploadFailed(file.name))
    },
  })
}

// A link attachment: no blob, just a title and URL on the same row shape.
export function useAddLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      title,
      url,
      target,
    }: {
      title: string
      url: string
      target: AttachmentTarget
    }) =>
      monospace.attachments.createOne({
        data: attachmentsCreateSchema.parse({
          fileName: title,
          url,
          ...connectTarget(target),
        } satisfies attachmentsCreateOneInput),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(crmCopy.files.link))
      await refreshCrm(queryClient, 'attachments')
    },
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, assetId }: { id: Uuid; assetId: Uuid | null }) => {
      await monospace.attachments.deleteOne({ key: id, fields: ['id'] })

      if (assetId) await deleteAsset(assetId)
    },
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.files.singular))
      await refreshCrm(queryClient, 'attachments')
    },
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: organizationsCreateOneInput) =>
      monospace.organizations.createOne({
        data: organizationsCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(crmCopy.organizations.singular))
      await refreshCrm(queryClient, 'organizations')
    },
  })
}

export function useUpdateOrganization({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<organizationsUpdateOneInput>) =>
      monospace.organizations.updateOne({
        key: id,
        data: organizationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.organizations.singular))
      await refreshCrm(queryClient, 'organizations')
    },
  })
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.organizations.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.organizations.singular))
      await refreshCrm(queryClient, 'organizations')
    },
  })
}

export function useCreateContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: contactsCreateOneInput) =>
      monospace.contacts.createOne({ data: contactsCreateSchema.parse(input), fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(crmCopy.contacts.singular))
      await refreshCrm(queryClient, 'contacts')
    },
  })
}

export function useUpdateContact({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<contactsUpdateOneInput>) =>
      monospace.contacts.updateOne({
        key: id,
        data: contactsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.contacts.singular))
      await refreshCrm(queryClient, 'contacts')
    },
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.contacts.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.contacts.singular))
      await refreshCrm(queryClient, 'contacts')
    },
  })
}

export function useCreateAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: contactOrganizationsCreateOneInput) =>
      monospace.contactOrganizations.createOne({
        data: contactOrganizationsCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.saved(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient, 'contactOrganizations')
    },
  })
}

export function useUpdateAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<contactOrganizationsUpdateOneInput>) =>
      monospace.contactOrganizations.updateOne({
        key: id,
        data: contactOrganizationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.saved(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient, 'contactOrganizations')
    },
  })
}

export function useDeleteAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.contactOrganizations.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient, 'contactOrganizations')
    },
  })
}

export function useCreateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: opportunitiesCreateOneInput) =>
      monospace.opportunities.createOne({
        data: opportunitiesCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(crmCopy.deals.singular))
      await refreshCrm(queryClient, 'opportunities')
    },
  })
}

export function useUpdateDeal({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<opportunitiesUpdateOneInput>) =>
      monospace.opportunities.updateOne({
        key: id,
        data: opportunitiesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.deals.singular))
      await refreshCrm(queryClient, 'opportunities')
    },
  })
}

export function useDeleteDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.opportunities.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.deals.singular))
      await refreshCrm(queryClient, 'opportunities')
    },
  })
}

// Bulk actions from the list pages. Updates go in one request; deletes go one by one so a row
// still in use (an organization with contacts, say) fails alone instead of blocking the batch.
export type BulkDeleteResult = { deleted: number; failed: number }

async function deleteEach<T>(ids: Array<Uuid>, remove: (id: Uuid) => Promise<T>) {
  const results = await Promise.allSettled(ids.map((id) => remove(id)))
  const failed = results.filter((result) => result.status === 'rejected').length

  return { deleted: ids.length - failed, failed } satisfies BulkDeleteResult
}

function reportBulkDelete(result: BulkDeleteResult, noun: string) {
  if (result.deleted) toast.success(appCopy.toast.deletedMany(result.deleted, noun))

  if (result.failed) toast.error(appCopy.toast.deleteFailedMany(result.failed, noun))
}

export function useUpdateManyOrganizations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: organizationsUpdateOneInput }) =>
      monospace.organizations.updateMany({
        filter: { id: { _in: ids } },
        data: organizationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.organizations.title))
      await refreshCrm(queryClient, 'organizations')
    },
  })
}

export function useDeleteManyOrganizations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      deleteEach(ids, (id) => monospace.organizations.deleteOne({ key: id, fields: ['id'] })),
    onSuccess: async (result) => {
      reportBulkDelete(result, crmCopy.organizations.title)
      await refreshCrm(queryClient, 'organizations')
    },
  })
}

export function useUpdateManyContacts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: contactsUpdateOneInput }) =>
      monospace.contacts.updateMany({
        filter: { id: { _in: ids } },
        data: contactsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.contacts.title))
      await refreshCrm(queryClient, 'contacts')
    },
  })
}

export function useDeleteManyContacts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      deleteEach(ids, (id) => monospace.contacts.deleteOne({ key: id, fields: ['id'] })),
    onSuccess: async (result) => {
      reportBulkDelete(result, crmCopy.contacts.title)
      await refreshCrm(queryClient, 'contacts')
    },
  })
}

export function useUpdateManyDeals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: opportunitiesUpdateOneInput }) =>
      monospace.opportunities.updateMany({
        filter: { id: { _in: ids } },
        data: opportunitiesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.deals.title))
      await refreshCrm(queryClient, 'opportunities')
    },
  })
}

export function useDeleteManyDeals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      deleteEach(ids, (id) => monospace.opportunities.deleteOne({ key: id, fields: ['id'] })),
    onSuccess: async (result) => {
      reportBulkDelete(result, crmCopy.deals.title)
      await refreshCrm(queryClient, 'opportunities')
    },
  })
}

export function useCreateActivity({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: interactionsCreateOneInput) =>
      monospace.interactions.createOne({
        data: interactionsCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.created(crmCopy.activity.singular))
      await refreshCrm(queryClient, 'interactions')
    },
  })
}

export function useUpdateActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<interactionsUpdateOneInput>) =>
      monospace.interactions.updateOne({
        key: id,
        data: interactionsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { id, data }) => {
      if (data.status === 'completed') {
        toast.success(appCopy.toast.completed(crmCopy.activity.singular), {
          action: {
            label: appCopy.toast.undo,
            onClick: async (event) => {
              try {
                await monospace.interactions.updateOne({
                  key: id,
                  data: interactionsUpdateSchema.parse({ status: 'open', completedAt: null }),
                  fields: ['id'],
                })
                await refreshCrm(queryClient, 'interactions')
                toast.success(appCopy.toast.reopened(crmCopy.activity.singular))
              } catch {
                event.preventDefault()
                toast.error(appCopy.toast.undoFailed)
              }
            },
          },
        })
      } else {
        toast.success(appCopy.toast.saved(crmCopy.activity.singular))
      }

      await refreshCrm(queryClient, 'interactions')
    },
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.interactions.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.activity.singular))
      await refreshCrm(queryClient, 'interactions')
    },
  })
}

// Bulk triage from the activity page: reschedule, reassign, or drop a whole bucket.
export function useUpdateManyActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: interactionsUpdateOneInput }) =>
      monospace.interactions.updateMany({
        filter: { id: { _in: ids } },
        data: interactionsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.activity.plural))
      await refreshCrm(queryClient, 'interactions')
    },
  })
}

export function useDeleteManyActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      monospace.interactions.deleteMany({
        filter: { id: { _in: ids } },
        fields: ['id'],
      }),
    onSuccess: async (_result, ids) => {
      toast.success(appCopy.toast.deletedMany(ids.length, crmCopy.activity.plural))
      await refreshCrm(queryClient, 'interactions')
    },
  })
}

// The database allows one current primary affiliation per contact, so demote the rest first.
export async function clearPrimaryAffiliation(contactId: Uuid, exceptId?: Uuid) {
  await monospace.contactOrganizations.updateMany({
    filter: {
      _and: [
        { contactId: contactId },
        { isPrimary: true },
        ...(exceptId ? [{ id: { _neq: exceptId } }] : []),
      ],
    },
    data: { isPrimary: false },
    fields: ['id'],
  })
}

export function useCloseDeal() {
  const access = useCollectionAccess('opportunities')
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      organizationId,
      stage,
      valueAmount,
      closeDate,
      notes,
    }: {
      id: Uuid
      organizationId?: Uuid | null
      stage: PipelineStage
      valueAmount: string | null
      currency: string
      closeDate: string
      notes: string
    }) => {
      await monospace.opportunities.updateOne({
        key: id,
        data: opportunitiesUpdateSchema.parse({
          stageId: stage.id,
          status: statusForStage(stage),
          valueAmount: access.canUpdate('valueAmount') ? valueAmount : undefined,
          expectedCloseDate: access.canUpdate('expectedCloseDate') ? closeDate : undefined,
        }),
        fields: ['id'],
      })

      // A hidden organization leaves nowhere to file the note. The close itself still works.
      if (notes && organizationId) {
        const occurredAt = new Date().toISOString()
        await monospace.interactions.createOne({
          data: interactionsCreateSchema.parse({
            type: 'note',
            status: 'completed',
            direction: 'internal',
            subject: stage.isWon
              ? crmCopy.deals.close.winNoteSubject
              : crmCopy.deals.close.lossNoteSubject,
            body: notes,
            occurredAt,
            completedAt: occurredAt,
            dueAt: null,
            organizations: { _connect: { key: { id: organizationId } } },
            opportunities: { _connect: { key: { id } } },
          }),
          fields: ['id'],
        })
      }
    },
    onSuccess: (_result, { stage, valueAmount, currency }) => {
      if (stage.isWon)
        toast.success(crmCopy.deals.close.wonToast(formatMoney(valueAmount, currency)))
      else toast(crmCopy.deals.close.lostToast)
    },
    // The deal may have closed even if creating its note failed.
    onSettled: () => refreshCrm(queryClient, 'opportunities'),
  })
}
