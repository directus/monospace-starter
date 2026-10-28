// Writes for interviews, scorecards, and offers. Email and calendar aren't connected, so what
// would be sent is recorded as candidate_messages rows.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  applicationsUpdateOneInput,
  approvalsCreateOneInput,
  approvalsUpdateOneInput,
  candidateMessagesCreateOneInput,
  candidateNotesCreateOneInput,
  interviewsCreateOneInput,
  offersCreateOneInput,
  scorecardsCreateOneInput,
} from '@/generated/monospace'
import {
  applicationsUpdateSchema,
  approvalsCreateSchema,
  approvalsUpdateSchema,
  candidateMessagesCreateSchema,
  candidateNotesCreateSchema,
  interviewParticipantsCreateSchema,
  interviewsCreateSchema,
  interviewsUpdateSchema,
  offersCreateSchema,
  offersUpdateSchema,
  scorecardsCreateSchema,
  scorecardsUpdateSchema,
} from '@/generated/monospace/schemas'
import { now } from '@/lib/dates'
import { monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.interviews

type Group =
  | 'interviews'
  | 'candidates'
  | 'candidateMessages'
  | 'candidateNotes'
  | 'applications'
  | 'offers'
  | 'approvals'
  | 'requisitions'

function invalidate(queryClient: QueryClient, groups: Array<Group>) {
  return Promise.all(groups.map((group) => queryClient.invalidateQueries({ queryKey: [group] })))
}

export type OutgoingMessage = { candidateId: Uuid; subject: string; body: string }

function recordMessage({ candidateId, subject, body }: OutgoingMessage) {
  return monospace.candidateMessages.createOne({
    data: candidateMessagesCreateSchema.parse({
      candidates: { _connect: { key: { id: candidateId } } },
      direction: 'outbound',
      status: 'sent',
      subject: subject.slice(0, 240),
      body,
    } satisfies candidateMessagesCreateOneInput),
    fields: ['id'],
  })
}

const INTERVIEW_GROUPS: Array<Group> = [
  'interviews',
  'candidateMessages',
  'candidates',
  'applications',
]

export type InterviewInput = {
  title: string
  startsAt: string
  endsAt: string
  meetingUrl: string
  stageId: Uuid | null
}

export function useScheduleInterview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      applicationId,
      interview,
      interviewerIds,
      message,
    }: {
      applicationId: Uuid
      interview: InterviewInput
      interviewerIds: Array<Uuid>
      message: OutgoingMessage
    }) => {
      const created = await monospace.interviews.createOne({
        data: interviewsCreateSchema.parse({
          applications: { _connect: { key: { id: applicationId } } },
          interview_stages: interview.stageId
            ? { _connect: { key: { id: interview.stageId } } }
            : undefined,
          title: interview.title,
          startsAt: interview.startsAt,
          endsAt: interview.endsAt,
          meetingUrl: interview.meetingUrl,
          status: 'scheduled',
          interview_participants: [
            { _create: { data: interviewerIds.map((userId) => ({ userId })) } },
          ],
        } satisfies interviewsCreateOneInput),
        fields: ['id'],
      })

      await recordMessage(message)

      return created
    },
    onSuccess: async () => {
      toast.success(copy.toast.scheduled)
      await invalidate(queryClient, INTERVIEW_GROUPS)
    },
  })
}

export function useUpdateInterview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      interview,
      addUserIds,
      removeUserIds,
      message,
    }: {
      id: Uuid
      interview: InterviewInput
      addUserIds: Array<Uuid>
      removeUserIds: Array<Uuid>
      message: OutgoingMessage | null
    }) => {
      await monospace.interviews.updateOne({
        key: id,
        data: interviewsUpdateSchema.parse({
          title: interview.title,
          startsAt: interview.startsAt,
          endsAt: interview.endsAt,
          meetingUrl: interview.meetingUrl,
          interviewStageId: interview.stageId,
        }),
        fields: ['id'],
      })

      if (removeUserIds.length) {
        await monospace.interviewParticipants.deleteMany({
          filter: { interviewId: id, userId: { _in: removeUserIds } },
          fields: ['id'],
        })
      }

      if (addUserIds.length) {
        await monospace.interviewParticipants.createMany({
          data: addUserIds.map((userId) =>
            interviewParticipantsCreateSchema.parse({
              interviews: { _connect: { key: { id } } },
              userId,
            }),
          ),
          fields: ['id'],
        })
      }

      if (message) await recordMessage(message)
    },
    onSuccess: async () => {
      toast.success(copy.toast.updated)
      await invalidate(queryClient, INTERVIEW_GROUPS)
    },
  })
}

export function useCancelInterview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, message }: { id: Uuid; message: OutgoingMessage }) => {
      await monospace.interviews.updateOne({
        key: id,
        data: interviewsUpdateSchema.parse({ status: 'cancelled' }),
        fields: ['id'],
      })
      await recordMessage(message)
    },
    onSuccess: async () => {
      toast.success(copy.toast.cancelled)
      await invalidate(queryClient, INTERVIEW_GROUPS)
    },
  })
}

export type ScorecardInput = {
  recommendation: string
  summary: string | null
  positives: string | null
  flags: string | null
}

// One scorecard per interviewer per interview: edit the one there is, or add it.
export function useSaveScorecard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      interviewId,
      interviewerUserId,
      data,
    }: {
      id?: Uuid
      interviewId: Uuid
      interviewerUserId: Uuid
      data: ScorecardInput
    }) => {
      const existing = id
        ? { id }
        : (
            await monospace.scorecards.readMany({
              fields: ['id'],
              filter: { interviewId, interviewerUserId },
              limit: 1,
            })
          )[0]

      if (existing?.id) {
        return monospace.scorecards.updateOne({
          key: existing.id,
          data: scorecardsUpdateSchema.parse(data),
          fields: ['id'],
        })
      }

      return monospace.scorecards.createOne({
        data: scorecardsCreateSchema.parse({
          ...data,
          interviews: { _connect: { key: { id: interviewId } } },
          interviewerUserId,
          submittedAt: now(),
        } satisfies scorecardsCreateOneInput),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      toast.success(copy.toast.scorecardSaved)
      await invalidate(queryClient, ['interviews', 'applications', 'candidates'])
    },
  })
}

const OFFER_GROUPS: Array<Group> = [
  'offers',
  'approvals',
  'applications',
  'candidates',
  'requisitions',
]

export type OfferInput = {
  baseSalary: string | null
  currency: string
  equityUnits: number | null
  proposedStartDate: string | null
  candidateIntro: string | null
  searchOverview: string | null
}

export function useSaveOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      applicationId,
      data,
    }: {
      id: Uuid | null
      applicationId: Uuid
      data: OfferInput
    }) =>
      id
        ? monospace.offers.updateOne({
            key: id,
            data: offersUpdateSchema.parse(data),
            fields: ['id'],
          })
        : monospace.offers.createOne({
            data: offersCreateSchema.parse({
              ...data,
              status: 'draft',
              applications: { _connect: { key: { id: applicationId } } },
            } satisfies offersCreateOneInput),
            fields: ['id'],
          }),
    onSuccess: async () => {
      toast.success(copy.offer.toast.saved)
      await invalidate(queryClient, OFFER_GROUPS)
    },
  })
}

export const OFFER_APPROVERS = [
  'hiring_manager',
  'department_head',
  'vp_operations',
  'ceo',
] as const

// Starts the chain over: a resubmitted offer gets fresh approval steps.
export function useSubmitOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      offerId,
      approvers,
    }: {
      offerId: Uuid
      approvers: Array<{ role: string; userId: Uuid | null }>
    }) => {
      await monospace.approvals.deleteMany({ filter: { offerId }, fields: ['id'] })
      await monospace.approvals.createMany({
        data: approvers.map((approver, index) =>
          approvalsCreateSchema.parse({
            offers: { _connect: { key: { id: offerId } } },
            step: index + 1,
            approverRole: approver.role,
            approverUserId: approver.userId,
            decision: 'pending',
          } satisfies approvalsCreateOneInput),
        ),
        fields: ['id'],
      })
      await monospace.offers.updateOne({
        key: offerId,
        data: offersUpdateSchema.parse({ status: 'pending_approval' }),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      toast.success(copy.offer.toast.submitted)
      await invalidate(queryClient, OFFER_GROUPS)
    },
  })
}

// Records one step's decision, then settles the offer: any decline declines it, and the last
// approval approves it. Email isn't connected, so the "all approved" notice to TA and the hiring
// manager is kept as a note on the candidate.
export function useDecideApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      approvalId,
      offerId,
      decision,
      userId,
      note,
      notify,
    }: {
      approvalId: Uuid
      offerId: Uuid
      decision: 'approved' | 'declined'
      userId: Uuid | null
      note: string | null
      notify: { candidateId: Uuid; body: string }
    }) => {
      const data: approvalsUpdateOneInput = { decision, decidedAt: now(), note }

      if (userId) data.approverUserId = userId

      await monospace.approvals.updateOne({
        key: approvalId,
        data: approvalsUpdateSchema.parse(data),
        fields: ['id'],
      })

      const steps = await monospace.approvals.readMany({
        fields: ['id', 'decision'],
        filter: { offerId },
        limit: 20,
      })

      const status = steps.some((step) => step.decision === 'declined')
        ? 'declined'
        : steps.every((step) => step.decision === 'approved')
          ? 'approved'
          : 'pending_approval'

      await monospace.offers.updateOne({
        key: offerId,
        data: offersUpdateSchema.parse({ status }),
        fields: ['id'],
      })

      if (status === 'approved') {
        await monospace.candidateNotes.createOne({
          data: candidateNotesCreateSchema.parse({
            candidates: { _connect: { key: { id: notify.candidateId } } },
            body: notify.body,
            visibility: 'public',
          } satisfies candidateNotesCreateOneInput),
          fields: ['id'],
        })
      }

      return status
    },
    onSuccess: async (status, { decision }) => {
      toast.success(
        status === 'approved'
          ? copy.offer.toast.allApproved
          : decision === 'approved'
            ? copy.offer.toast.approved
            : copy.offer.toast.declined,
      )
      await invalidate(queryClient, [...OFFER_GROUPS, 'candidateNotes'])
    },
  })
}

export function useSetOfferStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ offerId, status }: { offerId: Uuid; status: 'draft' | 'sent' | 'rejected' }) =>
      monospace.offers.updateOne({
        key: offerId,
        data: offersUpdateSchema.parse({ status }),
        fields: ['id'],
      }),
    onSuccess: async (_result, { status }) => {
      if (status === 'sent') toast.success(copy.offer.toast.sent)

      if (status === 'rejected') toast.success(copy.offer.toast.rejected)
      await invalidate(queryClient, OFFER_GROUPS)
    },
  })
}

// Accepted: the offer closes and the application moves to the job's Hired stage.
export function useAcceptOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      offerId,
      applicationId,
      hiredStageId,
    }: {
      offerId: Uuid
      applicationId: Uuid
      hiredStageId: Uuid | null
    }) => {
      await monospace.offers.updateOne({
        key: offerId,
        data: offersUpdateSchema.parse({ status: 'accepted' }),
        fields: ['id'],
      })
      const data: applicationsUpdateOneInput = { status: 'hired' }

      if (hiredStageId) data.interviewStageId = hiredStageId

      await monospace.applications.updateOne({
        key: applicationId,
        data: applicationsUpdateSchema.parse(data),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      toast.success(copy.offer.toast.accepted)
      await invalidate(queryClient, OFFER_GROUPS)
    },
  })
}
