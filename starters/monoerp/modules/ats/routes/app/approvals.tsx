import { noop, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { z } from 'zod'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserLabel } from '@/components/users'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatDateTime } from '@/lib/format'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import {
  ApprovalCard,
  ApprovalSubjectLink,
  approvalKind,
  approvalTitle,
} from '@/modules/ats/components/requests/approval-card'
import type { ApprovalKind } from '@/modules/ats/components/requests/approval-card'
import { DecisionBadge } from '@/modules/ats/components/requests/request-badges'
import { approvalsQuery } from '@/modules/ats/data/requests'
import type { ApprovalRow, ApprovalsView } from '@/modules/ats/data/requests'
import { ApprovalIcon } from '@/modules/ats/icons'

const copy = atsCopy.requests.approvals

const searchSchema = z.object({
  view: z.enum(['pending', 'decided']).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/ats/approvals')({
  staticData: {
    page: {
      title: copy.title,
      icon: ApprovalIcon,
      module: 'ats',
      nav: 50,
      keywords: copy.keywords,
    },
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ view: search.view ?? 'pending' }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.query({ ...approvalsQuery(deps.view), staleTime: 'static' }).catch(noop)
  },
  component: ApprovalsPage,
})

const GROUPS: Array<{ kind: ApprovalKind; label: string }> = [
  { kind: 'request', label: copy.groups.request },
  { kind: 'plan', label: copy.groups.plan },
  { kind: 'offer', label: copy.groups.offer },
]

const isView = (value: unknown): value is ApprovalsView =>
  value === 'pending' || value === 'decided'

function ApprovalsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const view = search.view ?? 'pending'
  const pending = useQuery(approvalsQuery('pending'))
  const decided = useQuery({ ...approvalsQuery('decided'), enabled: view === 'decided' })
  // The tab count skips steps still waiting on an earlier approver.
  const ready = (pending.data ?? []).filter((approval) => !approval.waitingOn).length

  return (
    <div className="space-y-6">
      <PageHeader title={copy.title} description={copy.description} />
      <Tabs
        value={view}
        onValueChange={(next) => {
          if (isView(next))
            void navigate({ search: { view: next === 'pending' ? undefined : next } })
        }}
        className="gap-5"
      >
        <TabsList variant="line" className="border-b">
          <TabsTrigger value="pending">
            {copy.pending}
            {ready ? (
              <span className="ml-1.5 rounded-full bg-foreground px-1.5 text-[11px] leading-4 font-medium text-background tabular-nums">
                {ready}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="decided">{copy.decided}</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          {pending.isPending ? <DataLoading rows={6} /> : null}
          {pending.isError ? <DataError error={pending.error} /> : null}
          {pending.data ? <PendingList approvals={pending.data} /> : null}
        </TabsContent>
        <TabsContent value="decided">
          {decided.isPending ? <DataLoading rows={6} /> : null}
          {decided.isError ? <DataError error={decided.error} /> : null}
          {decided.data ? <DecidedList approvals={decided.data} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PendingList({ approvals }: { approvals: Array<ApprovalRow> }) {
  if (!approvals.some((approval) => !approval.waitingOn)) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-16 text-center">
        <Inbox className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-3 font-medium">{copy.emptyPending}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.emptyPendingHint}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        // A later step still waiting on an earlier one shows in that step's chain instead.
        const items = approvals.filter(
          (approval) => approvalKind(approval) === group.kind && !approval.waitingOn,
        )

        if (!items.length) return null

        return (
          <section key={group.kind} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {group.label}
              <span className="rounded-full bg-muted px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums">
                {items.length}
              </span>
            </h2>
            <div className="grid gap-3 xl:grid-cols-2">
              {items.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const KIND_LABEL: Record<ApprovalKind, string> = {
  plan: copy.groups.plan,
  request: copy.groups.request,
  offer: copy.groups.offer,
}

function DecidedList({ approvals }: { approvals: Array<ApprovalRow> }) {
  const isMobile = useIsMobile()

  if (!approvals.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{copy.emptyDecided}</p>
  }

  if (isMobile) {
    return (
      <ul className="divide-y rounded-xl border">
        {approvals.map((approval) => (
          <li key={approval.id} className="space-y-1 p-3">
            <div className="flex items-center justify-between gap-2">
              <ApprovalSubjectLink approval={approval} className="truncate font-medium">
                {approvalTitle(approval)}
              </ApprovalSubjectLink>
              <DecisionBadge decision={approval.decision} />
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                KIND_LABEL[approvalKind(approval)],
                optionLabel('approverRole', approval.approverRole),
                formatDateTime(approval.decidedAt),
              ].join(' · ')}
            </p>
            {approval.note ? (
              <p className="text-sm text-muted-foreground">{approval.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }

  const columns = copy.columns

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="pl-4">{columns.subject}</TableHead>
            <TableHead>{columns.type}</TableHead>
            <TableHead>{columns.step}</TableHead>
            <TableHead>{columns.decision}</TableHead>
            <TableHead>{columns.approver}</TableHead>
            <TableHead>{columns.decidedAt}</TableHead>
            <TableHead className="pr-4">{columns.note}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {approvals.map((approval) => (
            <TableRow key={approval.id}>
              <TableCell className="max-w-72 pl-4">
                <ApprovalSubjectLink
                  approval={approval}
                  className="block truncate font-medium hover:underline"
                >
                  {approvalTitle(approval)}
                </ApprovalSubjectLink>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {KIND_LABEL[approvalKind(approval)]}
              </TableCell>
              <TableCell>{optionLabel('approverRole', approval.approverRole)}</TableCell>
              <TableCell>
                <DecisionBadge decision={approval.decision} />
              </TableCell>
              <TableCell>
                <UserLabel user={approval.approverUser} size="sm" />
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(approval.decidedAt)}
              </TableCell>
              <TableCell className="max-w-80 truncate pr-4 text-muted-foreground">
                {approval.note}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
