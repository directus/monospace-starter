import { MonospaceNotFoundError } from '@monospace/sdk'
import { noop, useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { ListPlus, MapPin, Plus, TriangleAlert, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'

import { DataError, DataLoading } from '@/components/data-state'
import { requiredText } from '@/components/form/validators'
import { InlineReadOnly } from '@/components/inline/inline-field'
import { preloadNotesEditor } from '@/components/notes-editor'
import { RecordTitle } from '@/components/record-title'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { requisitionsUpdateOneInput } from '@/generated/monospace'
import { useCollectionAccess } from '@/lib/permissions'
import { ensureOrNotFound } from '@/lib/route-loaders'
import { cn } from '@/lib/utils'
import { uuidParam } from '@/lib/uuid'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { CandidateFormDrawer } from '@/modules/ats/components/candidates/candidate-form'
import { PeopleStack } from '@/modules/ats/components/interviews/recommendation'
import { HiringTeam } from '@/modules/ats/components/jobs/hiring-team'
import { InterviewPlan } from '@/modules/ats/components/jobs/interview-plan'
import { JobStatusBadge, UrgencyBadge } from '@/modules/ats/components/jobs/job-badges'
import { JobOverview } from '@/modules/ats/components/jobs/job-overview'
import { PipelineBoard } from '@/modules/ats/components/jobs/pipeline-board'
import type { PipelineScope } from '@/modules/ats/components/jobs/pipeline-board'
import {
  jobDetailQuery,
  jobPipelineQuery,
  needsAttention,
  reqLabel,
  splitLocations,
} from '@/modules/ats/data/jobs'
import type { JobDetail, PipelineApplication } from '@/modules/ats/data/jobs'
import { useUpdateJob } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs

const tabs = ['pipeline', 'overview', 'plan', 'team'] as const

const jobSearch = z.object({
  tab: z.enum(tabs).optional().catch(undefined),
  scope: z.enum(['open', 'rejected', 'all']).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/ats/jobs_/$jobId')({
  params: { parse: ({ jobId }) => ({ jobId: uuidParam(jobId) }) },
  validateSearch: jobSearch,
  staticData: {
    page: {
      title: copy.singular,
      module: 'ats',
      parent: '/ats/jobs',
      recordTitle: (queryClient, { jobId }) => {
        const record = queryClient.getQueryData(jobDetailQuery(uuidParam(jobId)).queryKey)

        return record ? (record.title ?? copy.singular) : undefined
      },
      fullWidth: true,
      fill: true,
    },
  },
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      ensureOrNotFound(queryClient, jobDetailQuery(params.jobId)),
      queryClient.query({ ...jobPipelineQuery(params.jobId), staleTime: 'static' }).catch(noop),
    ])
  },
  component: JobPage,
})

function JobPage() {
  const { jobId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const detail = useQuery(jobDetailQuery(jobId))
  const pipeline = useQuery(jobPipelineQuery(jobId))
  const access = useCollectionAccess('requisitions')
  const update = useUpdateJob()
  const [adding, setAdding] = useState(false)
  const tab = search.tab ?? 'pipeline'
  const scope = search.scope ?? 'open'

  if (detail.isError && detail.error instanceof MonospaceNotFoundError) throw notFound()

  if (detail.isPending) return <DataLoading rows={8} className="m-4 sm:m-6" />

  if (detail.isError) return <DataError error={detail.error} className="m-4 sm:m-6" />

  const job = detail.data
  const stages = job.interview_stages
  const applications = pipeline.data ?? []
  const locations = splitLocations(job.locations)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 space-y-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{reqLabel(job.reqNumber)}</span>
              <StatusMenu
                job={job}
                disabled={!access.canUpdate('status')}
                onChange={async (status) => {
                  await update.mutateAsync({ id: jobId, data: statusChange(job, status) })
                }}
              />
              <UrgencyBadge urgency={job.urgency === 'normal' ? null : job.urgency} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
              <InlineReadOnly value={!access.canUpdate('title')}>
                <RecordTitle
                  label={copy.overview.title}
                  value={job.title}
                  validate={requiredText(copy.overview.title)}

                  onSave={async (value) => {
                    if (value) await update.mutateAsync({ id: jobId, data: { title: value } })
                  }}
                />
              </InlineReadOnly>
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {[
                job.departments?.name,
                job.job_levels?.name,
                optionLabel('employmentType', job.employmentType),
              ]
                .filter(Boolean)
                .join(' · ')}
              {locations.length ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {locations.join(', ')}
                </span>
              ) : null}
              <span className="tabular-nums">{copy.openings(job.numberOfHires ?? 1)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ search: (previous) => ({ ...previous, tab: 'team' }) })}
              className="flex items-center gap-2 rounded-md p-1 text-xs text-muted-foreground hover:bg-muted"
              aria-label={copy.tabs.team}
            >
              <PeopleStack people={[job.hiringManagerUser, job.recruiterUser].filter(Boolean)} />
              <span className="hidden lg:block">
                {[job.hiringManagerUser?.fullName, job.recruiterUser?.fullName]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </button>
            <Button onClick={() => setAdding(true)} disabled={!stages.length}>
              <Plus data-icon="inline-start" />
              {copy.pipeline.addCandidate}
            </Button>
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              tab: next === 'pipeline' ? undefined : tabs.find((item) => item === next),
            }),
            replace: true,
          })
        }
        className="mt-3 min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="w-full shrink-0 justify-start gap-4 overflow-x-auto border-b px-4 sm:px-6 [&>[role=tab]]:flex-none [&>[role=tab]]:px-0.5"
        >
          <TabsTrigger value="pipeline">
            {copy.tabs.pipeline}
            <span className="text-xs text-muted-foreground tabular-nums">
              {applications.filter((row) => row.status === 'active').length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="overview"
            onPointerEnter={preloadNotesEditor}
            onFocus={preloadNotesEditor}
          >
            {copy.tabs.overview}
          </TabsTrigger>
          <TabsTrigger value="plan">
            {copy.tabs.plan}
            <span className="text-xs text-muted-foreground tabular-nums">{stages.length}</span>
          </TabsTrigger>
          <TabsTrigger value="team">{copy.tabs.team}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="flex min-h-0 flex-1 flex-col">
          {pipeline.isError ? (
            <DataError error={pipeline.error} className="m-4 sm:m-6" />
          ) : pipeline.isPending ? (
            <DataLoading rows={6} className="m-4 sm:m-6" />
          ) : stages.length ? (
            <>
              <PipelineToolbar
                job={job}
                applications={applications}
                scope={scope}
                onScopeChange={(next) =>
                  navigate({
                    search: (previous) => ({
                      ...previous,
                      scope: next === 'open' ? undefined : next,
                    }),
                    replace: true,
                  })
                }
              />
              <PipelineBoard
                jobId={jobId}
                stages={stages}
                applications={applications}
                scope={scope}
              />
            </>
          ) : (
            <NoPlan
              onSetUp={() => navigate({ search: (previous) => ({ ...previous, tab: 'plan' }) })}
            />
          )}
        </TabsContent>
        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] p-4 sm:p-6">
            <JobOverview job={job} />
          </div>
        </TabsContent>
        <TabsContent value="plan" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-4 sm:p-6">
            <InterviewPlan jobId={jobId} stages={stages} applications={applications} />
          </div>
        </TabsContent>
        <TabsContent value="team" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] p-4 sm:p-6">
            <HiringTeam job={job} applications={applications} />
          </div>
        </TabsContent>
      </Tabs>

      <CandidateFormDrawer open={adding} onOpenChange={setAdding} requisitionId={jobId} />
    </div>
  )
}

const statuses = Object.keys(atsCopy.options.requisitionStatus)

// Opening stamps opened_at the first time; closing stamps closed_at.
function statusChange(job: JobDetail, status: string): requisitionsUpdateOneInput {
  const data: requisitionsUpdateOneInput = { status }

  if (status === 'open' && !job.openedAt) data.openedAt = new Date().toISOString()

  if (status === 'closed') data.closedAt = new Date().toISOString()

  return data
}

const scopes = Object.keys(atsCopy.jobs.pipeline.scope).filter(
  (value): value is PipelineScope => value in atsCopy.jobs.pipeline.scope,
)

function StatusMenu({
  job,
  disabled,
  onChange,
}: {
  job: JobDetail
  disabled: boolean
  onChange: (status: string) => Promise<void>
}) {
  if (disabled) return <JobStatusBadge status={job.status} />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={copy.status.change}
            className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <JobStatusBadge status={job.status} menu />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {statuses.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={status === job.status}
            onClick={() => void onChange(status)}
          >
            <JobStatusBadge status={status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PipelineToolbar({
  job,
  applications,
  scope,
  onScopeChange,
}: {
  job: JobDetail
  applications: Array<PipelineApplication>
  scope: PipelineScope
  onScopeChange: (scope: PipelineScope) => void
}) {
  const [now] = useState(() => Date.now())
  const stagesById = new Map(job.interview_stages.map((stage) => [stage.id, stage]))
  const active = applications.filter((row) => row.status === 'active')

  const rejected = applications.filter(
    (row) => row.status === 'rejected' || row.status === 'withdrawn',
  )

  const hired = applications.filter((row) => row.status === 'hired').length

  const attention = active.filter((row) =>
    needsAttention(
      row,
      row.interviewStageId ? stagesById.get(row.interviewStageId) : undefined,
      now,
    ),
  ).length

  const fresh = active.filter(
    (row) => row.appliedAt && now - Date.parse(row.appliedAt) < 7 * 86_400_000,
  ).length

  const counts: Record<PipelineScope, number> = {
    open: active.length + hired,
    rejected: rejected.length,
    all: applications.length,
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <div
        role="group"
        aria-label={copy.pipeline.show}
        className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5 text-sm"
      >
        {scopes.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => onScopeChange(value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors pointer-coarse:py-1.5',
              scope === value
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {copy.pipeline.scope[value]}
            <span className="text-xs text-muted-foreground tabular-nums">{counts[value]}</span>
          </button>
        ))}
      </div>
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Stat label={copy.pipeline.stats.active} value={active.length} icon={<UsersRound />} />
        <Stat
          label={copy.pipeline.stats.attention}
          value={attention}
          icon={<TriangleAlert />}
          tone={attention ? 'warn' : undefined}
        />
        <Stat label={copy.pipeline.stats.newThisWeek} value={fresh} icon={<ListPlus />} />
        <Stat
          label={copy.pipeline.stats.hired}
          value={`${hired}/${job.numberOfHires ?? 1}`}
          tone={hired >= (job.numberOfHires ?? 1) ? 'good' : undefined}
        />
      </dl>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number | string
  icon?: React.ReactNode
  tone?: 'warn' | 'good'
}) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground [&_svg]:size-3.5">
      {icon}
      <dt>{label}</dt>
      <dd
        className={cn(
          'font-medium text-foreground tabular-nums',
          tone === 'warn' && 'text-amber-700 dark:text-amber-400',
          tone === 'good' && 'text-success',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function NoPlan({ onSetUp }: { onSetUp: () => void }) {
  return (
    <div className="m-4 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center sm:m-6">
      <h2 className="font-medium">{copy.pipeline.noStagesTitle}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {copy.pipeline.noStagesDescription}
      </p>
      <Button className="mt-5" onClick={onSetUp}>
        {copy.pipeline.setUpPlan}
      </Button>
    </div>
  )
}
