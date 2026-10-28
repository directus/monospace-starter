import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard, Megaphone } from 'lucide-react'
import { useMemo, useState } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentUser } from '@/lib/auth'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  JobsPanel,
  MetricStrip,
  NeedsAttention,
  QuickLinks,
  SourceMix,
  UpcomingInterviews,
  type AttentionItem,
} from '@/modules/ats/components/home/dashboard-panels'
import { PipelineChart } from '@/modules/ats/components/home/pipeline-chart'
import { daysOverdue, dashboardQuery, type Dashboard } from '@/modules/ats/data/home'
import { ApprovalIcon, RoleRequestIcon, WorkforcePlanIcon } from '@/modules/ats/icons'

const copy = atsCopy.home.dashboard

export const Route = createFileRoute('/_app/ats/')({
  staticData: {
    page: {
      title: copy.navTitle,
      icon: LayoutDashboard,
      module: 'ats',
      nav: 10,
      keywords: ['recruiting', 'hiring', 'ats', 'home'],
    },
  },
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...dashboardQuery(), staleTime: 'static' })
  },
  component: AtsDashboardPage,
})

type Scope = 'mine' | 'everyone'

function AtsDashboardPage() {
  const user = useCurrentUser()
  const dashboard = useQuery(dashboardQuery())
  const [picked, setPicked] = useState<Scope>()
  const firstName = user?.fullName?.split(' ')[0]

  // Start on "Mine" only when the user has something of their own to see.
  const hasOwn = Boolean(
    user &&
    dashboard.data &&
    (dashboard.data.jobs.some((job) => isMine(job, user.id)) ||
      dashboard.data.interviews.some((row) => row.participantIds.includes(user.id))),
  )

  const scope = picked ?? (hasOwn ? 'mine' : 'everyone')

  return (
    <div className="space-y-5">
      <PageHeader
        title={copy.greeting(firstName)}
        description={copy.description}
        actions={
          <Tabs value={scope} onValueChange={(value: Scope) => setPicked(value)}>
            <TabsList aria-label={copy.scope}>
              <TabsTrigger value="mine" className="px-3">
                {copy.mine}
              </TabsTrigger>
              <TabsTrigger value="everyone" className="px-3">
                {copy.everyone}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {dashboard.isPending ? (
        <DataLoading rows={8} />
      ) : dashboard.isError ? (
        <DataError error={dashboard.error} />
      ) : (
        <DashboardBody data={dashboard.data} userId={scope === 'mine' ? user?.id : undefined} />
      )}
    </div>
  )
}

function isMine(job: Dashboard['jobs'][number], userId: string) {
  return job.hiringManagerUserId === userId || job.recruiterUserId === userId
}

function DashboardBody({ data, userId }: { data: Dashboard; userId: string | undefined }) {
  // Fixed at mount, like RelativeTime: overdue days don't need to tick while the page is open.
  const [now] = useState(() => Date.now())

  const view = useMemo(() => {
    const jobs = userId ? data.jobs.filter((job) => isMine(job, userId)) : data.jobs
    const jobIds = new Set<string>(jobs.map((job) => job.id))
    const applications = data.applications.filter((row) => jobIds.has(row.requisitionId ?? ''))

    const interviews = userId
      ? data.interviews.filter((row) => row.participantIds.some((id) => id === userId))
      : data.interviews

    const jobById = new Map<string, Dashboard['jobs'][number]>(jobs.map((job) => [job.id, job]))
    const attention: Array<AttentionItem> = []

    for (const application of applications) {
      const job = jobById.get(application.requisitionId ?? '')
      const stage = job?.stages.find((item) => item.id === application.interviewStageId)
      const overdue = daysOverdue(application.stageEnteredAt, stage?.slaDays ?? null, now)

      if (job && stage && overdue)
        attention.push({ application, job, stageName: stage.name ?? '', overdue })
    }

    attention.sort((a, b) => b.overdue - a.overdue)

    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const today = interviews.filter(
      (row) => row.startsAt && new Date(row.startsAt) <= endOfToday,
    ).length

    return { jobs, applications, interviews, attention, today }
  }, [data, userId, now])

  const candidates = new Set(view.applications.map((row) => row.candidates?.id)).size

  return (
    <div className="space-y-5">
      <MetricStrip
        metrics={[
          {
            label: copy.metrics.openJobs,
            value: view.jobs.length,
            hint: copy.metrics.openJobsHint(
              view.jobs.reduce((sum, job) => sum + (job.numberOfHires ?? 1), 0),
            ),
            link: { to: '/ats/jobs' },
          },
          {
            label: copy.metrics.activeCandidates,
            value: candidates,
            hint: copy.metrics.activeCandidatesHint(view.jobs.length),
            link: { to: '/ats/candidates' },
          },
          {
            label: copy.metrics.interviews,
            value: view.interviews.length,
            hint: copy.metrics.interviewsHint(view.today),
            link: { to: '/ats/interviews' },
          },
          {
            label: copy.metrics.offers,
            value: data.offers.out,
            hint: copy.metrics.offersHint(data.offers.pending),
          },
          {
            label: copy.metrics.approvals,
            value: data.approvals,
            hint: copy.metrics.approvalsHint,
            link: { to: '/ats/approvals' },
          },
          {
            label: copy.metrics.attention,
            value: view.attention.length,
            hint: copy.metrics.attentionHint,
            tone: 'warning',
            link: { to: '.', hash: 'needs-attention' },
          },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <UpcomingInterviews interviews={view.interviews} mine={Boolean(userId)} />
          <JobsPanel jobs={view.jobs} applications={view.applications} mine={Boolean(userId)} />
          <PipelineChart jobs={view.jobs} applications={view.applications} />
        </div>
        <div className="min-w-0 space-y-5">
          <QuickLinks
            links={[
              {
                label: copy.links.roleRequest,
                hint: copy.links.roleRequestHint,
                icon: RoleRequestIcon,
                link: { to: '/ats/role-requests' },
              },
              {
                label: copy.links.workforcePlan,
                hint: copy.links.workforcePlanHint,
                icon: WorkforcePlanIcon,
                link: { to: '/ats/workforce-plan' },
              },
              {
                label: copy.links.refer,
                hint: copy.links.referHint,
                icon: Megaphone,
                link: { to: '/ats/open-roles' },
              },
              {
                label: copy.links.approvals,
                hint: copy.links.approvalsHint(data.approvals),
                icon: ApprovalIcon,
                link: { to: '/ats/approvals' },
              },
            ]}
          />
          <NeedsAttention items={view.attention} />
          <SourceMix applications={view.applications} />
        </div>
      </div>
    </div>
  )
}
