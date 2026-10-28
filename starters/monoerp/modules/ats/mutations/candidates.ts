// Writes for the candidates area. Inputs are parsed with the generated schemas before sending.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  applicationsUpdateOneInput,
  candidatesCreateOneInput,
  candidatesUpdateOneInput,
} from '@/generated/monospace'
import {
  applicationsCreateSchema,
  applicationsUpdateSchema,
  candidateFilesCreateSchema,
  candidateMessagesCreateSchema,
  candidateNotesCreateSchema,
  candidatesCreateSchema,
  candidatesUpdateSchema,
} from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { deleteAsset, uploadAsset } from '@/lib/assets'
import { keyed, monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  PRIVACY_NOTICE_TEMPLATE,
  candidateTemplateValues,
  fillTemplate,
} from '@/modules/ats/components/candidates/email-template'
import { findCandidateByEmail, firstStage } from '@/modules/ats/data/candidates'

const copy = atsCopy.candidates

type Group =
  | 'candidates'
  | 'applications'
  | 'requisitions'
  | 'candidateNotes'
  | 'candidateFiles'
  | 'candidateMessages'
  | 'auditEvents'
  | 'interviews'
  | 'offers'

// Candidates show up on job pipelines, the dashboard, and their own tabs, so refresh broadly.
function invalidate(queryClient: QueryClient, groups: Array<Group>) {
  return Promise.all(groups.map((group) => queryClient.invalidateQueries({ queryKey: [group] })))
}

type Update<TData> = { id: Uuid; data: TData }

function candidateName(candidate: { firstName?: string | null; lastName?: string | null }) {
  return [candidate.firstName, candidate.lastName].filter(Boolean).join(' ')
}

// Email sending is stubbed: the notice is recorded as a sent message from the "Privacy Notice"
// template, so the profile shows what the candidate would have received.
async function privacyNotice(candidate: { firstName: string; lastName: string; email: string }) {
  const [template] = await monospace.emailTemplates.readMany({
    fields: ['subject', 'body'],
    filter: { name: { _icontains: PRIVACY_NOTICE_TEMPLATE } },
    limit: 1,
  })

  const values = candidateTemplateValues({ candidate })

  return {
    subject: fillTemplate(template?.subject ?? copy.privacyNotice.subject, values),
    body: fillTemplate(template?.body ?? copy.privacyNotice.body, values),
  }
}

async function addApplication(candidateId: Uuid, requisitionId: Uuid) {
  const stage = await firstStage(requisitionId)

  if (!stage) throw new Error(copy.applications.noStages)

  return monospace.applications.createOne({
    data: applicationsCreateSchema.parse({
      candidates: { _connect: { key: { id: candidateId } } },
      requisitions: { _connect: { key: { id: requisitionId } } },
      interview_stages: { _connect: { key: { id: stage.id } } },
    }),
    fields: ['id'],
  })
}

export type CreateCandidateResult = {
  id: Uuid
  name: string
  existing: boolean
  alreadyOnJob: boolean
}

// One profile per email: an existing profile is reused (and added to the job), never duplicated.
export function useCreateCandidate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      data,
      requisition,
    }: {
      data: Omit<candidatesCreateOneInput, 'candidate_messages'>
      requisition?: { id: Uuid; title: string } | null
    }): Promise<CreateCandidateResult> => {
      const existing = await findCandidateByEmail(data.email)

      if (existing) {
        let alreadyOnJob = false

        if (requisition) {
          const current = await monospace.applications.readMany({
            fields: ['id'],
            filter: { candidateId: existing.id, requisitionId: requisition.id },
            limit: 1,
          })

          alreadyOnJob = keyed(current).length > 0

          if (!alreadyOnJob) await addApplication(existing.id, requisition.id)
        }

        return { id: existing.id, name: candidateName(existing), existing: true, alreadyOnJob }
      }

      const notice = await privacyNotice(data)
      const sentAt = new Date().toISOString()

      const created = await monospace.candidates.createOne({
        data: candidatesCreateSchema.parse({
          ...data,
          privacyNoticeSentAt: sentAt,
          candidate_messages: [
            {
              _create: {
                data: [
                  {
                    direction: 'outbound',
                    status: 'sent',
                    sendAt: sentAt,
                    subject: notice.subject,
                    body: notice.body,
                  },
                ],
              },
            },
          ],
        }),
        fields: ['id'],
      })

      if (!created.id) throw new Error(appCopy.form.saveFailed)

      if (requisition) await addApplication(created.id, requisition.id)

      return { id: created.id, name: candidateName(data), existing: false, alreadyOnJob: false }
    },
    onSuccess: async (result, { requisition }) => {
      if (!result.existing) toast.success(copy.form.created(result.name))
      else if (result.alreadyOnJob && requisition)
        toast.info(copy.form.alreadyOnJob(result.name, requisition.title))
      else if (requisition) toast.success(copy.form.existingAdded(result.name, requisition.title))
      else toast.info(copy.form.existing(result.name))

      await invalidate(queryClient, [
        'candidates',
        'applications',
        'requisitions',
        'candidateMessages',
        'auditEvents',
      ])
    },
  })
}

export function useUpdateCandidate({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<candidatesUpdateOneInput>) =>
      monospace.candidates.updateOne({
        key: id,
        data: candidatesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(copy.singular))
      await invalidate(queryClient, ['candidates', 'applications', 'auditEvents'])
    },
  })
}

export function useUpdateManyCandidates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ids, data }: { ids: Array<Uuid>; data: candidatesUpdateOneInput }) =>
      monospace.candidates.updateMany({
        filter: { id: { _in: ids } },
        data: candidatesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async (_result, { ids }) => {
      toast.success(appCopy.toast.savedMany(ids.length, copy.title))
      await invalidate(queryClient, ['candidates', 'auditEvents'])
    },
  })
}

// "Delete all candidate data": uploaded files go from storage first, then the row. Applications,
// interviews, scorecards, offers, notes, files, and emails cascade in the database; the audit
// log keeps the record of the delete.
export function useDeleteCandidate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: Uuid; name: string }) => {
      const files = await monospace.candidateFiles.readMany({
        fields: ['assetId'],
        filter: { candidateId: id, assetId: { _null: false } },
        limit: 500,
      })

      await Promise.all(
        files.flatMap((file) =>
          file.assetId ? [deleteAsset(file.assetId).catch(() => undefined)] : [],
        ),
      )

      return monospace.candidates.deleteOne({ key: id, fields: ['id'] })
    },
    onSuccess: async (_result, { name }) => {
      toast.success(copy.privacy.deleted(name))
      await invalidate(queryClient, [
        'candidates',
        'applications',
        'requisitions',
        'interviews',
        'offers',
        'auditEvents',
      ])
    },
  })
}

// Applications

export function useAddToJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ candidateId, requisitionId }: { candidateId: Uuid; requisitionId: Uuid }) =>
      addApplication(candidateId, requisitionId),
    onSuccess: async () => {
      await invalidate(queryClient, ['applications', 'candidates', 'requisitions', 'auditEvents'])
    },
  })
}

export function useUpdateApplication({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<applicationsUpdateOneInput>) =>
      monospace.applications.updateOne({
        key: id,
        data: applicationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(copy.applications.stepper))
      await invalidate(queryClient, ['applications', 'candidates', 'requisitions', 'auditEvents'])
    },
  })
}

// Notes

export function useCreateCandidateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      candidateId,
      body,
      visibility,
    }: {
      candidateId: Uuid
      body: string
      visibility: 'public' | 'private'
    }) =>
      monospace.candidateNotes.createOne({
        data: candidateNotesCreateSchema.parse({
          candidates: { _connect: { key: { id: candidateId } } },
          body,
          visibility,
        }),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(copy.notes.saved)
      await invalidate(queryClient, ['candidateNotes', 'auditEvents'])
    },
  })
}

export function useDeleteCandidateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.candidateNotes.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(copy.notes.deleted)
      await invalidate(queryClient, ['candidateNotes', 'auditEvents'])
    },
  })
}

// Files

export function useUploadCandidateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      candidateId,
      file,
      kind,
    }: {
      candidateId: Uuid
      file: File
      kind: 'resume' | 'other'
    }) => {
      const assetId = await uploadAsset(file)

      try {
        return await monospace.candidateFiles.createOne({
          data: candidateFilesCreateSchema.parse({
            candidates: { _connect: { key: { id: candidateId } } },
            assetId,
            fileName: file.name,
            contentType: file.type || null,
            kind,
          }),
          fields: ['id'],
        })
      } catch (error) {
        await deleteAsset(assetId).catch(() => undefined)
        throw error
      }
    },
    onSuccess: async (_result, { file }) => {
      toast.success(copy.files.uploaded(file.name))
      await invalidate(queryClient, ['candidateFiles'])
    },
    onError: (_error, { file }) => {
      toast.error(copy.files.uploadFailed(file.name))
    },
  })
}

export function useAddCandidateLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      candidateId,
      fileName,
      url,
      kind,
    }: {
      candidateId: Uuid
      fileName: string
      url: string
      kind: string
    }) =>
      monospace.candidateFiles.createOne({
        data: candidateFilesCreateSchema.parse({
          candidates: { _connect: { key: { id: candidateId } } },
          fileName,
          url,
          kind,
        }),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(copy.files.linkAdded)
      await invalidate(queryClient, ['candidateFiles'])
    },
  })
}

export function useDeleteCandidateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, assetId }: { id: Uuid; assetId?: Uuid | null }) => {
      const result = await monospace.candidateFiles.deleteOne({ key: id, fields: ['id'] })

      if (assetId) await deleteAsset(assetId).catch(() => undefined)

      return result
    },
    onSuccess: async () => {
      toast.success(copy.files.deleted)
      await invalidate(queryClient, ['candidateFiles'])
    },
  })
}

// Emails. Gmail isn't connected: a send is recorded as sent, a future send_at as scheduled.

export function useSendCandidateMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      candidateId,
      subject,
      body,
      sendAt,
    }: {
      candidateId: Uuid
      subject: string
      body: string
      sendAt?: string
    }) => {
      const scheduled = Boolean(sendAt && new Date(sendAt).getTime() > Date.now())

      return monospace.candidateMessages.createOne({
        data: candidateMessagesCreateSchema.parse({
          candidates: { _connect: { key: { id: candidateId } } },
          direction: 'outbound',
          status: scheduled ? 'scheduled' : 'sent',
          sendAt: scheduled && sendAt ? sendAt : new Date().toISOString(),
          subject,
          body,
        }),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      await invalidate(queryClient, ['candidateMessages'])
    },
  })
}

// Records the privacy notice again (say, after an email change), as the create flow does.
export function useSendPrivacyNotice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (candidate: {
      id: Uuid
      firstName: string
      lastName: string
      email: string
    }) => {
      const notice = await privacyNotice(candidate)
      const sentAt = new Date().toISOString()

      await monospace.candidateMessages.createOne({
        data: candidateMessagesCreateSchema.parse({
          candidates: { _connect: { key: { id: candidate.id } } },
          direction: 'outbound',
          status: 'sent',
          sendAt: sentAt,
          ...notice,
        }),
        fields: ['id'],
      })

      return monospace.candidates.updateOne({
        key: candidate.id,
        data: candidatesUpdateSchema.parse({ privacyNoticeSentAt: sentAt }),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      toast.success(copy.privacy.noticeRecorded)
      await invalidate(queryClient, ['candidates', 'candidateMessages', 'auditEvents'])
    },
  })
}
