import { Link } from '@tanstack/react-router'
import { Check, Circle, CornerUpLeft, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useAppForm } from '@/components/form/app-form'
import { FormDialog } from '@/components/form/form-dialog'
import { optionalAmount } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { UserLabel } from '@/components/users'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { UrgencyBadge } from '@/modules/ats/components/jobs/job-badges'
import { FinanceDecisionForm } from '@/modules/ats/components/requests/finance-decision'
import { amountOrNull, wholeNumber } from '@/modules/ats/components/requests/form-helpers'
import type { ApprovalRow } from '@/modules/ats/data/requests'
import { useDecideApproval } from '@/modules/ats/mutations/interviews'
import { useDecidePlanApproval, useReturnOffer } from '@/modules/ats/mutations/requests'
import type { Decision } from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.approvals

export type ApprovalKind = 'plan' | 'request' | 'offer'

export function approvalKind(approval: ApprovalRow): ApprovalKind {
  return approval.workforcePlanRoleId ? 'plan' : approval.roleRequestId ? 'request' : 'offer'
}

export function candidateName(approval: ApprovalRow) {
  const candidate = approval.offers?.applications?.candidates

  return [candidate?.firstName, candidate?.lastName].filter(Boolean).join(' ')
}

// The steps in this approval's round, oldest first.
function roundOf(approval: ApprovalRow) {
  const siblings =
    approval.workforce_plan_roles?.approvals?.data ?? approval.offers?.approvals?.data ?? []

  return siblings
    .filter((sibling) => sibling.createdAt === approval.createdAt)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
}

export function approvalTitle(approval: ApprovalRow) {
  const kind = approvalKind(approval)

  if (kind === 'plan') return approval.workforce_plan_roles?.roleName ?? ''

  if (kind === 'request') return approval.role_requests?.roleName ?? ''

  return copy.offerFor(
    candidateName(approval),
    approval.offers?.applications?.requisitions?.title ?? '',
  )
}

export function ApprovalSubjectLink({
  approval,
  children,
  className,
}: {
  approval: ApprovalRow
  children: ReactNode
  className?: string
}) {
  const kind = approvalKind(approval)

  if (kind === 'request' && approval.roleRequestId) {
    return (
      <Link
        to="/ats/role-requests/$requestId"
        params={{ requestId: approval.roleRequestId }}
        className={className}
      >
        {children}
      </Link>
    )
  }

  const candidateId = approval.offers?.applications?.candidates?.id

  if (kind === 'offer' && candidateId) {
    return (
      <Link to="/ats/candidates/$candidateId" params={{ candidateId }} className={className}>
        {children}
      </Link>
    )
  }

  if (kind === 'plan') {
    return (
      <Link
        to="/ats/workforce-plan"
        search={{ year: approval.workforce_plan_roles?.planYear ?? undefined }}
        className={className}
      >
        {children}
      </Link>
    )
  }

  return <span className={className}>{children}</span>
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children || '–'}</dd>
    </div>
  )
}

function Facts({ approval }: { approval: ApprovalRow }) {
  const kind = approvalKind(approval)

  if (kind === 'plan') {
    const line = approval.workforce_plan_roles

    return (
      <>
        <Fact label={copy.headcount}>
          {copy.planHeadcount(line?.plannedHeadcount ?? 0, line?.currentHeadcount ?? 0)}
        </Fact>
        <Fact label={copy.budget}>{formatMoney(line?.budgetAmount, line?.currency ?? 'USD')}</Fact>
        <Fact label={atsCopy.requests.plan.columns.hireType}>
          {optionLabel('hireType', line?.hireType)}
        </Fact>
        <Fact label={atsCopy.requests.plan.columns.locations}>{line?.locations}</Fact>
      </>
    )
  }

  if (kind === 'request') {
    const request = approval.role_requests
    const plan = request?.workforce_plan_roles
    const currency = request?.currency ?? 'USD'

    return (
      <>
        <Fact label={atsCopy.requests.detail.hires}>{request?.numberOfHires}</Fact>
        <Fact label={atsCopy.requests.detail.urgency}>
          <UrgencyBadge urgency={request?.urgency} />
        </Fact>
        <Fact
          label={plan ? atsCopy.requests.detail.planBudget : atsCopy.requests.detail.proposedRange}
        >
          {plan
            ? formatMoney(plan.budgetAmount, plan.currency ?? 'USD')
            : request?.compMin || request?.compMax
              ? atsCopy.requests.finance.range(
                  formatMoney(request.compMin ?? request.compMax, currency),
                  formatMoney(request.compMax ?? request.compMin, currency),
                )
              : null}
        </Fact>
        <Fact label={atsCopy.requests.detail.requester}>
          <UserLabel user={approval.requesterUser} size="sm" />
        </Fact>
      </>
    )
  }

  const offer = approval.offers
  const job = offer?.applications?.requisitions
  const jobCurrency = job?.currency ?? 'USD'

  return (
    <>
      <Fact label={copy.baseSalary}>
        {formatMoney(offer?.baseSalary, offer?.currency ?? 'USD')}
      </Fact>
      <Fact label={copy.jobRange}>
        {job?.compMin && job.compMax
          ? atsCopy.requests.finance.range(
              formatMoney(job.compMin, jobCurrency),
              formatMoney(job.compMax, jobCurrency),
            )
          : null}
      </Fact>
      <Fact label={copy.equity}>{offer?.equityUnits?.toLocaleString()}</Fact>
      <Fact label={copy.startDate}>{formatDate(offer?.proposedStartDate)}</Fact>
    </>
  )
}

function contextLine(approval: ApprovalRow) {
  const kind = approvalKind(approval)

  if (kind === 'plan') {
    const line = approval.workforce_plan_roles

    return [line?.departments?.name, line?.team, line?.job_levels?.name, line?.planYear]
      .filter(Boolean)
      .join(' · ')
  }

  if (kind === 'request') {
    const request = approval.role_requests

    return [
      request?.departments?.name,
      request?.job_levels?.name,
      request?.workforcePlanRoleId
        ? atsCopy.requests.requests.inPlan
        : atsCopy.requests.requests.notInPlan,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const job = approval.offers?.applications?.requisitions
  const candidate = approval.offers?.applications?.candidates

  return [
    job?.reqNumber ? `REQ-${job.reqNumber}` : null,
    job?.departments?.name,
    [candidate?.city, candidate?.country].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
}

function StepChain({ approval }: { approval: ApprovalRow }) {
  const round = roundOf(approval)

  if (round.length < 2) return null

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {round.map((step, index) => {
        const current = step.id === approval.id
        const Icon = step.decision === 'approved' ? Check : step.decision === 'pending' ? Circle : X

        return (
          <li key={step.id ?? index} className="flex items-center gap-1">
            {index ? <span className="h-px w-3 bg-border" aria-hidden /> : null}
            <span
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-md border px-2',
                step.decision === 'approved' && 'border-transparent bg-success/10 text-success',
                current && 'border-foreground/30 bg-background font-medium text-foreground',
                !current && step.decision === 'pending' && 'text-muted-foreground',
              )}
            >
              <Icon className={cn('size-3', step.decision === 'pending' && 'size-2.5')} />
              {optionLabel('approverRole', step.approverRole)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

type Dialog = { decision: Decision } | null

export function ApprovalCard({ approval }: { approval: ApprovalRow }) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const kind = approvalKind(approval)
  const justification = approval.role_requests?.businessJustification

  return (
    <article className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <ApprovalSubjectLink approval={approval} className="font-semibold hover:underline">
            {approvalTitle(approval)}
          </ApprovalSubjectLink>
          <p className="text-sm text-muted-foreground">{contextLine(approval)}</p>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground sm:flex-col sm:items-end">
          <span>
            {copy.step(approval.step ?? 1, optionLabel('approverRole', approval.approverRole))}
          </span>
          <span>{copy.requested(formatDate(approval.createdAt))}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Facts approval={approval} />
      </dl>

      {justification ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{justification}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <StepChain approval={approval} />
        <div className="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <Button variant="ghost" size="sm" onClick={() => setDialog({ decision: 'returned' })}>
            <CornerUpLeft data-icon="inline-start" />
            {copy.return}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDialog({ decision: 'declined' })}
          >
            <X data-icon="inline-start" />
            {copy.decline}
          </Button>
          <Button size="sm" onClick={() => setDialog({ decision: 'approved' })}>
            <Check data-icon="inline-start" />
            {copy.approve}
          </Button>
        </div>
      </div>

      {dialog ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={`${dialogTitle(dialog.decision)} · ${approvalTitle(approval)}`}
          className="sm:max-w-lg"
        >
          {kind === 'request' && approval.roleRequestId ? (
            <FinanceDecisionForm
              subject={{
                id: approval.roleRequestId,
                compMin: approval.role_requests?.compMin,
                compMax: approval.role_requests?.compMax,
                currency: approval.role_requests?.currency,
                hasVariableComp: Boolean(approval.role_requests?.departments?.hasVariableComp),
                pendingApprovalId: approval.id,
              }}
              initialDecision={dialog.decision}
              onDone={() => setDialog(null)}
              onCancel={() => setDialog(null)}
            />
          ) : (
            <StepDecisionForm
              approval={approval}
              decision={dialog.decision}
              onDone={() => setDialog(null)}
            />
          )}
        </FormDialog>
      ) : null}
    </article>
  )
}

function dialogTitle(decision: Decision) {
  return decision === 'approved'
    ? copy.approveTitle
    : decision === 'declined'
      ? copy.declineTitle
      : copy.returnTitle
}

// Plan lines and offers. Plan approvers can adjust the approved headcount and budget.
function StepDecisionForm({
  approval,
  decision,
  onDone,
}: {
  approval: ApprovalRow
  decision: Decision
  onDone: () => void
}) {
  const currentUser = useCurrentUser()
  const decidePlan = useDecidePlanApproval()
  const decideOffer = useDecideApproval()
  const returnOffer = useReturnOffer()
  const [submitError, setSubmitError] = useState<string>()
  const kind = approvalKind(approval)
  const line = approval.workforce_plan_roles
  const round = roundOf(approval)
  const final = !round.some((step) => (step.step ?? 0) > (approval.step ?? 0))
  const approving = decision === 'approved'
  const needsNote = !approving
  const editsPlan = kind === 'plan' && approving

  const form = useAppForm({
    defaultValues: {
      headcount: String(line?.approvedHeadcount ?? line?.plannedHeadcount ?? 1),
      budget: line?.budgetAmount ?? '',
      note: '',
    },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      const note = value.note.trim() || null
      const userId = currentUser?.id ?? null

      try {
        if (kind === 'plan' && approval.workforcePlanRoleId) {
          await decidePlan.mutateAsync({
            approvalId: approval.id,
            lineId: approval.workforcePlanRoleId,
            decision,
            note,
            userId,
            final,
            line: editsPlan
              ? {
                  approvedHeadcount: Number(value.headcount),
                  budgetAmount: amountOrNull(value.budget),
                }
              : undefined,
          })
        } else if (kind === 'offer' && approval.offerId) {
          const candidateId = approval.offers?.applications?.candidates?.id

          if (decision === 'returned') {
            await returnOffer.mutateAsync({
              approvalId: approval.id,
              offerId: approval.offerId,
              note: note ?? '',
              userId,
            })
          } else if (candidateId) {
            await decideOffer.mutateAsync({
              approvalId: approval.id,
              offerId: approval.offerId,
              decision,
              userId,
              note,
              notify: {
                candidateId,
                body: atsCopy.interviews.offer.approvedNote(
                  candidateName(approval),
                  approval.offers?.applications?.requisitions?.title ?? '',
                ),
              },
            })
          }
        }

        onDone()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {editsPlan ? (
        <div className="grid grid-cols-2 gap-3">
          <form.AppField
            name="headcount"
            validators={{ onBlur: wholeNumber(), onSubmit: wholeNumber() }}
          >
            {(field) => (
              <field.TextField
                label={atsCopy.requests.plan.form.approvedHeadcount}
                inputMode="numeric"
                hint={copy.planHeadcount(line?.plannedHeadcount ?? 0, line?.currentHeadcount ?? 0)}
              />
            )}
          </form.AppField>
          <form.AppField
            name="budget"
            validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
          >
            {(field) => (
              <field.TextField
                label={`${copy.budget} (${line?.currency ?? 'USD'})`}
                inputMode="decimal"
                optional
              />
            )}
          </form.AppField>
        </div>
      ) : null}
      <form.AppField
        name="note"
        validators={{
          onSubmit: ({ value }) =>
            needsNote && !value.trim() ? { message: copy.noteRequired } : undefined,
        }}
      >
        {(field) => (
          <field.TextareaField
            label={
              decision === 'declined'
                ? copy.declineReason
                : decision === 'returned'
                  ? copy.returnReason
                  : copy.noteOptional
            }
            optional={!needsNote}
            rows={3}
            autoFocus
          />
        )}
      </form.AppField>
      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {appCopy.common.cancel}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <Button
              type="submit"
              variant={decision === 'declined' ? 'destructive' : 'default'}
              disabled={submitting}
            >
              {submitting ? atsCopy.requests.finance.saving : dialogTitle(decision)}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}
