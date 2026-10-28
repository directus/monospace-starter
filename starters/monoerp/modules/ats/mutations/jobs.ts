// Writes for jobs: the requisition itself, its interview stages, and moving applications
// through the pipeline.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  applicationsUpdateOneInput,
  interviewStagesCreateOneInput,
  interviewStagesUpdateOneInput,
  requisitionsCreateOneInput,
  requisitionsUpdateOneInput,
} from '@/generated/monospace'
import {
  applicationsUpdateSchema,
  interviewStagesCreateSchema,
  interviewStagesUpdateSchema,
  requisitionsCreateSchema,
  requisitionsUpdateSchema,
} from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'
import { reqLabel } from '@/modules/ats/data/jobs'
import type { PipelineApplication } from '@/modules/ats/data/jobs'

type Group = 'requisitions' | 'applications' | 'candidates' | 'interviewStages'

function invalidate(queryClient: QueryClient, groups: Array<Group>) {
  return Promise.all(groups.map((group) => queryClient.invalidateQueries({ queryKey: [group] })))
}

type Update<TData> = { id: Uuid; data: TData }

// A draft job, created with its interview stages in one write.
export function useCreateJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: requisitionsCreateOneInput) =>
      monospace.requisitions.createOne({
        data: requisitionsCreateSchema.parse(input),
        fields: ['id', 'reqNumber'],
      }),
    onSuccess: async (job) => {
      toast.success(atsCopy.jobs.create.created(reqLabel(job.reqNumber)))
      await invalidate(queryClient, ['requisitions', 'interviewStages'])
    },
  })
}

export function useUpdateJob({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<requisitionsUpdateOneInput>) =>
      monospace.requisitions.updateOne({
        key: id,
        data: requisitionsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(atsCopy.jobs.singular))
      await invalidate(queryClient, ['requisitions', 'applications', 'candidates'])
    },
  })
}

// Applications

type PipelineCache = Array<PipelineApplication>

function optimisticMove(
  row: PipelineApplication,
  data: applicationsUpdateOneInput,
  now: string,
): PipelineApplication {
  const next = { ...row, lastActivityAt: now }

  if (data.interviewStageId && data.interviewStageId !== row.interviewStageId) {
    next.interviewStageId = data.interviewStageId
    next.stageEnteredAt = now
  }

  if (data.status) next.status = data.status

  if (data.rejectionReason !== undefined) next.rejectionReason = data.rejectionReason

  return next
}

// Moves a card. The board shows the move at once; a failure puts the cached pipeline back.
export function useMoveApplication(jobId: Uuid) {
  const queryClient = useQueryClient()
  const key = ['applications', 'pipeline', jobId]

  return useMutation({
    mutationFn: ({ id, data }: Update<applicationsUpdateOneInput>) =>
      monospace.applications.updateOne({
        key: id,
        data: applicationsUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PipelineCache>(key)
      const now = new Date().toISOString()

      queryClient.setQueryData<PipelineCache>(key, (rows) =>
        rows?.map((row) => (row.id === id ? optimisticMove(row, data, now) : row)),
      )

      return { previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSettled: async () => {
      await invalidate(queryClient, ['applications', 'requisitions', 'candidates'])
    },
  })
}

// Interview stages

export function useCreateStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      requisitionId,
      name,
      kind,
      slaDays,
      position,
    }: {
      requisitionId: Uuid
      name: string
      kind: string
      slaDays: number | null
      position: number
    }) =>
      monospace.interviewStages.createOne({
        data: interviewStagesCreateSchema.parse({
          name,
          kind,
          slaDays,
          position,
          requisitions: { _connect: { key: { id: requisitionId } } },
        } satisfies interviewStagesCreateOneInput),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(atsCopy.jobs.plan.name))
      await invalidate(queryClient, ['requisitions', 'interviewStages', 'applications'])
    },
  })
}

export function useUpdateStage({ notify = true }: { notify?: boolean } = {}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: Update<interviewStagesUpdateOneInput>) =>
      monospace.interviewStages.updateOne({
        key: id,
        data: interviewStagesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      if (notify) toast.success(appCopy.toast.saved(atsCopy.jobs.plan.name))
      await invalidate(queryClient, ['requisitions', 'interviewStages', 'applications'])
    },
  })
}

export function useDeleteStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.interviewStages.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(atsCopy.jobs.plan.name))
      await invalidate(queryClient, ['requisitions', 'interviewStages', 'applications'])
    },
  })
}
