import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  attachmentsCreateOneInput,
  affiliationsCreateOneInput,
  affiliationsUpdateOneInput,
  contactsCreateOneInput,
  contactsUpdateOneInput,
  activitiesCreateOneInput,
  activitiesUpdateOneInput,
  dealsCreateOneInput,
  dealsUpdateOneInput,
  organizationsCreateOneInput,
  organizationsUpdateOneInput,
} from '@/generated/monospace'
import {
  attachmentsCreateSchema,
  affiliationsCreateSchema,
  affiliationsUpdateSchema,
  contactsCreateSchema,
  contactsUpdateSchema,
  activitiesCreateSchema,
  activitiesUpdateSchema,
  dealsCreateSchema,
  dealsUpdateSchema,
  organizationsCreateSchema,
  organizationsUpdateSchema,
} from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { deleteAsset, uploadAsset } from '@/lib/assets'
import { formatMoney } from '@/lib/format'
import { monospace } from '@/lib/monospace'
import { knownMember } from '@/lib/monospace-system'
import { useCollectionAccess } from '@/lib/permissions'
import { crmCopy } from '@/modules/crm/crm.copy'
import {
  contactDetailQuery,
  dealDetailQuery,
  organizationDetailQuery,
  pipelineStagesQuery,
} from '@/modules/crm/data'
import type { ContactDetail, DealDetail, DealRow, OrganizationDetail } from '@/modules/crm/data'
import type { PipelineStage } from '@/modules/crm/data'
import type { AttachmentTarget } from '@/modules/crm/data'
import { statusForStage } from '@/modules/crm/deals'
import { patchCached, patchRow, refreshCrm } from '@/modules/crm/refresh'

function connectTarget(target: AttachmentTarget) {
  return {
    organizations: { _connect: { key: { id: target.organizationId } } },
    contacts: target.contactId ? { _connect: { key: { id: target.contactId } } } : undefined,
    deals: target.dealId ? { _connect: { key: { id: target.dealId } } } : undefined,
    activities: target.activityId ? { _connect: { key: { id: target.activityId } } } : undefined,
  }
}

type Update<TData> = { id: Uuid; data: TData }

// Record edits that write plain fields only (no relation operations), so the same change can be
// shown in cached rows before the server answers.
type FieldUpdate<T> = {
  [K in keyof T as NonNullable<T[K]> extends ReadonlyArray<object> ? never : K]?: T[K]
}

// Rows show owners as people, so an owner change also fills in who it is.
function withKnownOwner<T extends { ownerUserId?: Uuid | null }>(data: T) {
  return data.ownerUserId === undefined ? data : { ...data, owner: knownMember(data.ownerUserId) }
}

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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateOrganization({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<FieldUpdate<organizationsUpdateOneInput>>) =>
      monospace.organizations.updateOne({
        key: id,
        data: organizationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    // Inline edits show at once, and the refresh doesn't hold the field in its saving state.
    onMutate: ({ id, data }) =>
      patchCached<OrganizationDetail>(
        queryClient,
        { queryKey: organizationDetailQuery(id).queryKey, exact: true },
        (detail) => ({ ...detail, ...withKnownOwner(data) }),
      ),
    onError: (_error, _input, rollback) => rollback?.(),
    onSuccess: () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.organizations.singular))
    },
    onSettled: () => void refreshCrm(queryClient),
  })
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.organizations.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.organizations.singular))
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateContact({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<FieldUpdate<contactsUpdateOneInput>>) =>
      monospace.contacts.updateOne({
        key: id,
        data: contactsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    // Inline edits show at once, and the refresh doesn't hold the field in its saving state.
    onMutate: ({ id, data }) =>
      patchCached<ContactDetail>(
        queryClient,
        { queryKey: contactDetailQuery(id).queryKey, exact: true },
        (detail) => ({ ...detail, ...withKnownOwner(data) }),
      ),
    onError: (_error, _input, rollback) => rollback?.(),
    onSuccess: () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.contacts.singular))
    },
    onSettled: () => void refreshCrm(queryClient),
  })
}

export function useDeleteContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.contacts.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.contacts.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useCreateAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: affiliationsCreateOneInput) =>
      monospace.affiliations.createOne({
        data: affiliationsCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.saved(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<affiliationsUpdateOneInput>) =>
      monospace.affiliations.updateOne({
        key: id,
        data: affiliationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.saved(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useDeleteAffiliation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.affiliations.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.contacts.affiliations.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useCreateDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: dealsCreateOneInput) =>
      monospace.deals.createOne({
        data: dealsCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(crmCopy.deals.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateDeal({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<FieldUpdate<dealsUpdateOneInput>>) =>
      monospace.deals.updateOne({
        key: id,
        data: dealsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    // Inline edits show at once, and the refresh doesn't hold the field in its saving state.
    // The board groups by the embedded stage, so a stage move fills that in too.
    onMutate: async ({ id, data }) => {
      const stage = queryClient
        .getQueryData(pipelineStagesQuery().queryKey)
        ?.find((item) => item.id === data.stageId)

      const patch = withKnownOwner(data)

      const rollbacks = await Promise.all([
        patchCached<DealDetail>(
          queryClient,
          { queryKey: dealDetailQuery(id).queryKey, exact: true },
          (detail) => ({ ...detail, ...patch, pipeline_stages: stage ?? detail.pipeline_stages }),
        ),
        // Every-deal reads (board, dashboard) are arrays under ['deals', filters].
        patchCached<DealRow[]>(
          queryClient,
          { queryKey: ['deals'], predicate: (query) => Array.isArray(query.state.data) },
          (rows) => patchRow(rows, id, stage ? { ...patch, pipeline_stages: stage } : patch),
        ),
      ])

      return () => {
        for (const rollback of rollbacks) rollback()
      }
    },
    onError: (_error, _input, rollback) => rollback?.(),
    onSuccess: () => {
      if (notify) toast.success(appCopy.toast.saved(crmCopy.deals.singular))
    },
    onSettled: (_result, _error, { data }) => {
      const refresh = refreshCrm(queryClient)

      // A new organization or contact shows by name, which only the refetch brings, so those
      // saves stay pending until it lands.
      return data.organizationId === undefined && data.contactId === undefined ? undefined : refresh
    },
  })
}

export function useDeleteDeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.deals.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.deals.singular))
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
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
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateManyDeals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: dealsUpdateOneInput }) =>
      monospace.deals.updateMany({
        filter: { id: { _in: ids } },
        data: dealsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.deals.title))
      await refreshCrm(queryClient)
    },
  })
}

export function useDeleteManyDeals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      deleteEach(ids, (id) => monospace.deals.deleteOne({ key: id, fields: ['id'] })),
    onSuccess: async (result) => {
      reportBulkDelete(result, crmCopy.deals.title)
      await refreshCrm(queryClient)
    },
  })
}

export function useCreateActivity({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: activitiesCreateOneInput) =>
      monospace.activities.createOne({
        data: activitiesCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.created(crmCopy.activity.singular))
      await refreshCrm(queryClient)
    },
  })
}

export function useUpdateActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<activitiesUpdateOneInput>) =>
      monospace.activities.updateOne({
        key: id,
        data: activitiesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { id, data }) => {
      if (data.status === 'completed') {
        toast.success(appCopy.toast.completed(crmCopy.activity.singular), {
          action: {
            label: appCopy.toast.undo,
            onClick: async (event) => {
              try {
                await monospace.activities.updateOne({
                  key: id,
                  data: activitiesUpdateSchema.parse({ status: 'open', completedAt: null }),
                  fields: ['id'],
                })
                await refreshCrm(queryClient)
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

      // Rows show a spinner until the refreshed list drops or moves them.
      await refreshCrm(queryClient)
    },
  })
}

export function useDeleteActivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.activities.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(crmCopy.activity.singular))
      await refreshCrm(queryClient)
    },
  })
}

// Bulk triage from the activity page: reschedule, reassign, or drop a whole bucket.
export function useUpdateManyActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: activitiesUpdateOneInput }) =>
      monospace.activities.updateMany({
        filter: { id: { _in: ids } },
        data: activitiesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, crmCopy.activity.plural))
      await refreshCrm(queryClient)
    },
  })
}

export function useDeleteManyActivities() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: Array<Uuid>) =>
      monospace.activities.deleteMany({
        filter: { id: { _in: ids } },
        fields: ['id'],
      }),
    onSuccess: async (_result, ids) => {
      toast.success(appCopy.toast.deletedMany(ids.length, crmCopy.activity.plural))
      await refreshCrm(queryClient)
    },
  })
}

// The database allows one current primary affiliation per contact, so demote the rest first.
export async function clearPrimaryAffiliation(contactId: Uuid, exceptId?: Uuid) {
  await monospace.affiliations.updateMany({
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
  const access = useCollectionAccess('deals')
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
      await monospace.deals.updateOne({
        key: id,
        data: dealsUpdateSchema.parse({
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
        await monospace.activities.createOne({
          data: activitiesCreateSchema.parse({
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
            deals: { _connect: { key: { id } } },
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
    onSettled: () => refreshCrm(queryClient),
  })
}
