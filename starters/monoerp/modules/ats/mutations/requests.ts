// Writes for workforce planning, role requests, approvals, and the job kickoff.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  approvalsCreateOneInput,
  requisitionsCreateOneInput,
  roleRequestsCreateOneInput,
  roleRequestsUpdateOneInput,
  workforcePlanRolesCreateOneInput,
  workforcePlanRolesUpdateOneInput,
} from '@/generated/monospace'
import {
  approvalsCreateSchema,
  approvalsUpdateSchema,
  offersUpdateSchema,
  requisitionsCreateSchema,
  roleRequestsCreateSchema,
  roleRequestsUpdateSchema,
  workforcePlanRolesCreateSchema,
  workforcePlanRolesUpdateSchema,
} from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.requests

type Group =
  | 'workforcePlanRoles'
  | 'roleRequests'
  | 'approvals'
  | 'requisitions'
  | 'interviewStages'
  | 'offers'

function invalidate(queryClient: QueryClient, groups: Array<Group>) {
  return Promise.all(groups.map((group) => queryClient.invalidateQueries({ queryKey: [group] })))
}

const now = () => new Date().toISOString()

export const PLAN_APPROVERS = ['vp_operations', 'ceo'] as const

export type Decision = 'approved' | 'declined' | 'returned'

// Workforce plan

export function useCreatePlanLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: workforcePlanRolesCreateOneInput) =>
      monospace.workforcePlanRoles.createOne({
        data: workforcePlanRolesCreateSchema.parse(input),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.created(copy.plan.line))
      await invalidate(queryClient, ['workforcePlanRoles'])
    },
  })
}

export function useUpdatePlanLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: Uuid; data: workforcePlanRolesUpdateOneInput }) =>
      monospace.workforcePlanRoles.updateOne({
        key: id,
        data: workforcePlanRolesUpdateSchema.parse(data),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(appCopy.toast.saved(copy.plan.line))
      await invalidate(queryClient, ['workforcePlanRoles', 'approvals'])
    },
  })
}

export function useDeletePlanLine() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: Uuid) => monospace.workforcePlanRoles.deleteOne({ key: id, fields: ['id'] }),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(copy.plan.line))
      await invalidate(queryClient, ['workforcePlanRoles', 'approvals'])
    },
  })
}

// Each line gets a fresh round: VP Operations, then the CEO. Rows in one round share a
// created_at, which is how the approvals inbox tells rounds apart.
export function useSubmitPlanLines() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: Array<Uuid>) => {
      const createdAt = now()

      await monospace.approvals.createMany({
        data: ids.flatMap((id) =>
          PLAN_APPROVERS.map((role, index) =>
            approvalsCreateSchema.parse({
              workforce_plan_roles: { _connect: { key: { id } } },
              step: index + 1,
              approverRole: role,
              decision: 'pending',
              createdAt,
            } satisfies approvalsCreateOneInput),
          ),
        ),
        fields: ['id'],
      })
      await monospace.workforcePlanRoles.updateMany({
        filter: { id: { _in: ids } },
        data: workforcePlanRolesUpdateSchema.parse({ status: 'submitted' }),
        fields: ['id'],
      })
    },
    onSuccess: async (_result, ids) => {
      toast.success(copy.plan.submitted(ids.length))
      await invalidate(queryClient, ['workforcePlanRoles', 'approvals'])
    },
  })
}

// Records one step on a plan line. Approvers can set the approved headcount and budget at any
// step; the last approval approves the line, and a decline or return ends the round.
export function useDecidePlanApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      approvalId,
      lineId,
      decision,
      note,
      userId,
      final,
      line,
    }: {
      approvalId: Uuid
      lineId: Uuid
      decision: Decision
      note: string | null
      userId: Uuid | null
      final: boolean
      line?: { approvedHeadcount: number; budgetAmount: string | null }
    }) => {
      await monospace.approvals.updateOne({
        key: approvalId,
        data: approvalsUpdateSchema.parse({
          decision,
          note,
          decidedAt: now(),
          approverUserId: userId,
        }),
        fields: ['id'],
      })

      if (decision !== 'approved') {
        await monospace.approvals.deleteMany({
          filter: { workforcePlanRoleId: lineId, decision: 'pending' },
          fields: ['id'],
        })
      }

      const status =
        decision === 'declined'
          ? 'declined'
          : decision === 'returned'
            ? 'draft'
            : final
              ? 'approved'
              : 'submitted'

      const data: workforcePlanRolesUpdateOneInput = { status }

      if (decision === 'approved' && line) Object.assign(data, line)

      await monospace.workforcePlanRoles.updateOne({
        key: lineId,
        data: workforcePlanRolesUpdateSchema.parse(data),
        fields: ['id'],
      })
    },
    onSuccess: async (_result, { decision }) => {
      toast.success(decisionToast(decision))
      await invalidate(queryClient, ['workforcePlanRoles', 'approvals'])
    },
  })
}

// Offers: approve and decline are the interviews area's useDecideApproval. Returning sends the
// offer back to draft and drops the rest of the round, so the recruiter resubmits a fresh one.
export function useReturnOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      approvalId,
      offerId,
      note,
      userId,
    }: {
      approvalId: Uuid
      offerId: Uuid
      note: string
      userId: Uuid | null
    }) => {
      await monospace.approvals.updateOne({
        key: approvalId,
        data: approvalsUpdateSchema.parse({
          decision: 'returned',
          note,
          decidedAt: now(),
          approverUserId: userId,
        }),
        fields: ['id'],
      })
      await monospace.approvals.deleteMany({
        filter: { offerId, decision: 'pending' },
        fields: ['id'],
      })
      await monospace.offers.updateOne({
        key: offerId,
        data: offersUpdateSchema.parse({ status: 'draft' }),
        fields: ['id'],
      })
    },
    onSuccess: async () => {
      toast.success(copy.approvals.returnedToast)
      await invalidate(queryClient, ['offers', 'approvals'])
    },
  })
}

function decisionToast(decision: Decision) {
  return decision === 'approved'
    ? copy.approvals.approvedToast
    : decision === 'declined'
      ? copy.approvals.declinedToast
      : copy.approvals.returnedToast
}

// Role requests

const financeStep = (): approvalsCreateOneInput => ({
  step: 1,
  approverRole: 'finance',
  decision: 'pending',
})

export function useCreateRoleRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<roleRequestsCreateOneInput, 'approvals' | 'status'>) =>
      monospace.roleRequests.createOne({
        data: roleRequestsCreateSchema.parse({
          ...input,
          status: 'submitted',
          approvals: [{ _create: { data: [financeStep()] } }],
        } satisfies roleRequestsCreateOneInput),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(copy.requests.submittedToast)
      await invalidate(queryClient, ['roleRequests', 'approvals', 'workforcePlanRoles'])
    },
  })
}

// After a return: the requester edits the request and it goes back to finance as a new step.
export function useResubmitRoleRequest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: Uuid; data: roleRequestsUpdateOneInput }) =>
      monospace.roleRequests.updateOne({
        key: id,
        data: roleRequestsUpdateSchema.parse({
          ...data,
          status: 'submitted',
          decisionNote: null,
          decidedAt: null,
          decidedByUserId: null,
          approvals: [{ _create: { data: [financeStep()] } }],
        } satisfies roleRequestsUpdateOneInput),
        fields: ['id'],
      }),
    onSuccess: async () => {
      toast.success(copy.requests.resubmittedToast)
      await invalidate(queryClient, ['roleRequests', 'approvals', 'workforcePlanRoles'])
    },
  })
}

export type FinanceBudget = {
  approvedBaseMin: string
  approvedBaseMax: string
  approvedVariableMin: string | null
  approvedVariableMax: string | null
  approvedCurrency: string
  approvedEquityUnits: number | null
}

// Finance's decision lands on the request and on its pending finance step (made here if the
// request somehow has none, so the history always shows who decided).
export function useFinanceDecision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      requestId,
      approvalId,
      decision,
      note,
      budget,
      userId,
    }: {
      requestId: Uuid
      approvalId: Uuid | null
      decision: Decision
      note: string | null
      budget?: FinanceBudget
      userId: Uuid | null
    }) => {
      const decidedAt = now()
      const step = { decision, note, decidedAt, approverUserId: userId }

      const data: roleRequestsUpdateOneInput = {
        status: decision,
        decisionNote: note,
        decidedAt,
        decidedByUserId: userId,
      }

      if (decision === 'approved' && budget) Object.assign(data, budget)

      await monospace.roleRequests.updateOne({
        key: requestId,
        data: roleRequestsUpdateSchema.parse(data),
        fields: ['id'],
      })

      if (approvalId) {
        await monospace.approvals.updateOne({
          key: approvalId,
          data: approvalsUpdateSchema.parse(step),
          fields: ['id'],
        })
      } else {
        await monospace.approvals.createOne({
          data: approvalsCreateSchema.parse({
            ...financeStep(),
            ...step,
            role_requests: { _connect: { key: { id: requestId } } },
          } satisfies approvalsCreateOneInput),
          fields: ['id'],
        })
      }
    },
    onSuccess: async (_result, { decision }) => {
      toast.success(
        decision === 'approved'
          ? copy.finance.approvedToast
          : decision === 'declined'
            ? copy.finance.declinedToast
            : copy.finance.returnedToast,
      )
      await invalidate(queryClient, ['roleRequests', 'approvals', 'workforcePlanRoles'])
    },
  })
}

// Kickoff

// Saving the kickoff creates the draft job with its interview plan in one write.
export function useCreateKickoffJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: requisitionsCreateOneInput) =>
      monospace.requisitions.createOne({
        data: requisitionsCreateSchema.parse(input),
        fields: ['id', 'reqNumber'],
      }),
    onSuccess: async (job) => {
      if (job.reqNumber) toast.success(copy.kickoff.savedToast(job.reqNumber))
      await invalidate(queryClient, [
        'requisitions',
        'interviewStages',
        'roleRequests',
        'workforcePlanRoles',
      ])
    },
  })
}
