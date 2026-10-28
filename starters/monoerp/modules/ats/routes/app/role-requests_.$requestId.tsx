import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Briefcase, Pencil, Rocket } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { UserLabel, userName } from '@/components/users'
import { appCopy } from '@/lib/app.copy'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { ensureOrNotFound } from '@/lib/route-loaders'
import { uuidParam } from '@/lib/uuid'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { UrgencyBadge } from '@/modules/ats/components/jobs/job-badges'
import { FinanceDecisionForm } from '@/modules/ats/components/requests/finance-decision'
import { KickoffFormDrawer } from '@/modules/ats/components/requests/kickoff-form'
import { splitLocations } from '@/modules/ats/components/requests/locations-field'
import { DecisionBadge, RequestStatusBadge } from '@/modules/ats/components/requests/request-badges'
import { RoleRequestDrawer } from '@/modules/ats/components/requests/role-request-form'
import { roleRequestDetailQuery } from '@/modules/ats/data/requests'
import type { RoleRequestDetail } from '@/modules/ats/data/requests'

const copy = atsCopy.requests

const detail = copy.detail

const finance = copy.finance

export const Route = createFileRoute('/_app/ats/role-requests_/$requestId')({
  params: { parse: ({ requestId }) => ({ requestId: uuidParam(requestId) }) },
  staticData: {
    page: {
      title: copy.requests.singular,
      module: 'ats',
      parent: '/ats/role-requests',
      recordTitle: (queryClient, { requestId }) => {
        const record = queryClient.getQueryData(
          roleRequestDetailQuery(uuidParam(requestId)).queryKey,
        )

        return record ? (record.roleName ?? copy.requests.singular) : undefined
      },
    },
  },
  loader: async ({ context: { queryClient }, params }) => {
    await ensureOrNotFound(queryClient, roleRequestDetailQuery(params.requestId))
  },
  component: RoleRequestPage,
})

function range(from: string | null | undefined, to: string | null | undefined, currency: string) {
  if (!from && !to) return null

  return finance.range(formatMoney(from ?? to, currency), formatMoney(to ?? from, currency))
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm">
        {children || <span className="text-muted-foreground">–</span>}
      </dd>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Frame>
      <FrameHeader className="px-4 pt-3 pb-2">
        <FrameTitle>{title}</FrameTitle>
        {description ? (
          <FrameDescription className="text-xs">{description}</FrameDescription>
        ) : null}
      </FrameHeader>
      <FramePanel className="px-5 py-4">{children}</FramePanel>
    </Frame>
  )
}

function RoleRequestPage() {
  const { requestId } = Route.useParams()
  const request = useQuery(roleRequestDetailQuery(requestId))
  const [editing, setEditing] = useState(false)
  const [kickoff, setKickoff] = useState(false)

  if (request.isPending) return <DataLoading rows={8} />

  if (request.isError) return <DataError error={request.error} />

  const data = request.data
  const job = data.requisitions
  const approved = data.status === 'approved'

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.roleName}
        description={[data.departments?.name, data.job_levels?.name].filter(Boolean).join(' · ')}
        actions={
          <>
            <RequestStatusBadge status={data.status} />
            {data.status === 'returned' ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" />
                {copy.requests.editRequest}
              </Button>
            ) : null}
            {job?.id && job.reqNumber ? (
              <Button
                variant="outline"
                render={<Link to="/ats/jobs/$jobId" params={{ jobId: job.id }} />}
              >
                <Briefcase data-icon="inline-start" />
                {detail.viewJob(job.reqNumber)}
              </Button>
            ) : approved ? (
              <Button onClick={() => setKickoff(true)}>
                <Rocket data-icon="inline-start" />
                {detail.startKickoff}
              </Button>
            ) : null}
          </>
        }
      />

      {approved && !job ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{detail.nextStep}</p>
            <p className="text-sm text-muted-foreground">{detail.nextStepBody}</p>
          </div>
          <Button size="sm" onClick={() => setKickoff(true)}>
            {detail.startKickoff}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <RequestSection request={data} />
          <Section title={detail.businessCase}>
            <dl className="grid grid-cols-2 gap-4">
              <Item label={detail.reason}>
                {optionLabel('hiringReason', data.hiringReason)}
                {data.hiringReasonDetail ? (
                  <span className="text-muted-foreground"> · {data.hiringReasonDetail}</span>
                ) : null}
              </Item>
              <Item label={detail.urgency}>
                <span className="flex flex-wrap items-center gap-2">
                  <UrgencyBadge urgency={data.urgency} />
                  {data.urgencyImpact ? (
                    <span className="text-muted-foreground">
                      {optionLabel('urgencyImpact', data.urgencyImpact)}
                    </span>
                  ) : null}
                </span>
              </Item>
              <Item label={detail.justification} wide>
                {data.businessJustification ? (
                  <p className="whitespace-pre-line">{data.businessJustification}</p>
                ) : null}
              </Item>
            </dl>
          </Section>
          <Section title={detail.requestedComp}>
            <dl className="grid grid-cols-2 gap-4">
              <Item label={detail.proposedRange}>
                {range(data.compMin, data.compMax, data.currency ?? 'USD') ?? (
                  <span className="text-muted-foreground">{detail.noComp}</span>
                )}
              </Item>
              {data.workforce_plan_roles ? (
                <Item label={detail.planBudget}>
                  {formatMoney(
                    data.workforce_plan_roles.budgetAmount,
                    data.workforce_plan_roles.currency ?? 'USD',
                  )}
                </Item>
              ) : null}
            </dl>
          </Section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <Section
            title={finance.title}
            description={data.status === 'submitted' ? finance.description : undefined}
          >
            {data.status === 'submitted' && data.id ? (
              <FinanceDecisionForm
                subject={{
                  id: data.id,
                  compMin: data.compMin,
                  compMax: data.compMax,
                  currency: data.currency,
                  hasVariableComp: Boolean(data.departments?.hasVariableComp),
                  pendingApprovalId:
                    data.approvals.data.find(
                      (approval) =>
                        approval.approverRole === 'finance' && approval.decision === 'pending',
                    )?.id ?? null,
                }}
              />
            ) : (
              <FinanceOutcome request={data} />
            )}
          </Section>
          <Section title={detail.history}>
            <ApprovalHistory approvals={data.approvals.data} />
          </Section>
        </div>
      </div>

      <RoleRequestDrawer open={editing} onOpenChange={setEditing} request={data} />
      {data.id ? (
        <KickoffFormDrawer roleRequestId={data.id} open={kickoff} onOpenChange={setKickoff} />
      ) : null}
    </div>
  )
}

function RequestSection({ request }: { request: RoleRequestDetail }) {
  const plan = request.workforce_plan_roles

  const type =
    plan?.hireType === 'replacement' || request.hiringReason === 'backfill' ? 'replacement' : 'new'

  return (
    <Section title={detail.request} description={detail.submittedOn(formatDate(request.createdAt))}>
      <dl className="grid grid-cols-2 gap-4">
        <Item label={detail.type}>{optionLabel('hireType', type)}</Item>
        <Item label={detail.jobName}>{request.roleName}</Item>
        <Item label={detail.department}>{request.departments?.name}</Item>
        <Item label={detail.level}>{request.job_levels?.name}</Item>
        <Item label={detail.locations}>
          {splitLocations(request.locations).length ? (
            <span className="flex flex-wrap gap-1">
              {splitLocations(request.locations).map((location) => (
                <span
                  key={location}
                  className="rounded-md border bg-muted/40 px-1.5 text-xs leading-5"
                >
                  {location}
                </span>
              ))}
            </span>
          ) : null}
        </Item>
        <Item label={detail.employmentType}>
          {optionLabel('employmentType', request.employmentType)}
        </Item>
        <Item label={detail.hires}>{request.numberOfHires}</Item>
        <Item label={detail.planLine}>
          {plan ? (
            detail.planLineValue(plan.roleName ?? '', plan.planYear ?? 0)
          ) : (
            <span className="text-muted-foreground">{detail.offPlan}</span>
          )}
        </Item>
        <Item label={detail.requester}>
          <UserLabel user={request.requesterUser} size="sm" />
        </Item>
        <Item label={detail.hiringManager}>
          <UserLabel user={request.hiringManagerUser} size="sm" />
        </Item>
      </dl>
    </Section>
  )
}

function FinanceOutcome({ request }: { request: RoleRequestDetail }) {
  const currency = request.approvedCurrency ?? request.currency ?? 'USD'
  const decidedBy = request.decidedByUser ? userName(request.decidedByUser) : null

  const total = range(
    request.approvedBaseMin
      ? String(Number(request.approvedBaseMin) + Number(request.approvedVariableMin ?? 0))
      : null,
    request.approvedBaseMax
      ? String(Number(request.approvedBaseMax) + Number(request.approvedVariableMax ?? 0))
      : null,
    currency,
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RequestStatusBadge status={request.status} />
        {request.decidedAt ? (
          <span className="text-xs text-muted-foreground">
            {finance.decidedBy(
              decidedBy ?? appCopy.fallback.unknown,
              formatDateTime(request.decidedAt),
            )}
          </span>
        ) : null}
      </div>
      {request.status === 'approved' ? (
        <dl className="grid grid-cols-2 gap-4">
          <Item label={finance.base}>
            {range(request.approvedBaseMin, request.approvedBaseMax, currency)}
          </Item>
          {request.approvedVariableMin || request.approvedVariableMax ? (
            <Item label={finance.variable}>
              {range(request.approvedVariableMin, request.approvedVariableMax, currency)}
            </Item>
          ) : null}
          <Item label={finance.total}>{total}</Item>
          <Item label={finance.currency}>{currency}</Item>
          <Item label={finance.equity}>{request.approvedEquityUnits?.toLocaleString()}</Item>
        </dl>
      ) : null}
      {request.decisionNote ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-line">
          {request.decisionNote}
        </p>
      ) : null}
      {request.requisitions?.kickoffAt ? (
        <p className="text-xs text-muted-foreground">
          {detail.kickoffDone(formatDateTime(request.requisitions.kickoffAt))}
        </p>
      ) : null}
    </div>
  )
}

function ApprovalHistory({ approvals }: { approvals: RoleRequestDetail['approvals']['data'] }) {
  if (!approvals.length) {
    return <p className="text-sm text-muted-foreground">{detail.noHistory}</p>
  }

  return (
    <ol className="space-y-3">
      {[...approvals].reverse().map((approval) => (
        <li key={approval.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {optionLabel('approverRole', approval.approverRole)}
              </span>
              <DecisionBadge decision={approval.decision} />
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                approval.approverUser ? userName(approval.approverUser) : null,
                formatDateTime(approval.decidedAt ?? approval.createdAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {approval.note ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{approval.note}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
