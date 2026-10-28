import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ArrowRight, Clock, Video } from 'lucide-react'
import { useState } from 'react'
import type { ComponentType, ReactNode } from 'react'

import { EntityAvatar } from '@/components/avatars'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Member } from '@/lib/monospace-system'
import { avatarUrl, ownerLabel } from '@/lib/users'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { kindColor, sourceColor } from '@/modules/ats/components/home/stage-kinds'
import type { ActiveApplication, OpenJob, UpcomingInterview } from '@/modules/ats/data/home'

const copy = atsCopy.home.dashboard

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

const dayLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

export function Panel({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <Frame dense className={className} id={id}>
      <FramePanel className="flex flex-col">
        <FrameHeader className="flex-row items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0 flex-1 space-y-0.5">
            <FrameTitle>{title}</FrameTitle>
            {description ? (
              <FrameDescription className="text-xs">{description}</FrameDescription>
            ) : null}
          </div>
          {action}
        </FrameHeader>
        {children}
      </FramePanel>
    </Frame>
  )
}

export function PanelLink({ children, ...link }: LinkProps & { children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      className="-mr-1.5 text-muted-foreground"
      nativeButton={false}
      render={<Link {...link} />}
    >
      {children}
      <ArrowRight data-icon="inline-end" />
    </Button>
  )
}

export type Metric = {
  label: string
  value: number
  hint: string
  link?: LinkProps
  tone?: 'warning'
}

// One strip with dividers, not six cards: the numbers read as a row.
export function MetricStrip({ metrics }: { metrics: Array<Metric> }) {
  return (
    <Frame dense>
      <FramePanel className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const body = (
            <>
              <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
              <span
                className={cn(
                  'mt-1 text-2xl font-semibold tracking-tight tabular-nums',
                  metric.tone === 'warning' &&
                    metric.value > 0 &&
                    'text-amber-600 dark:text-amber-400',
                )}
              >
                {metric.value}
              </span>
              <span className="mt-0.5 truncate text-xs text-muted-foreground">{metric.hint}</span>
            </>
          )

          const className =
            'flex min-w-0 flex-col border-border px-4 py-3.5 max-xl:[&:nth-child(n+3)]:border-t max-md:[&:nth-child(even)]:border-l md:max-xl:[&:not(:nth-child(3n+1))]:border-l md:max-xl:[&:nth-child(n+3)]:border-t-0 md:max-xl:[&:nth-child(n+4)]:border-t xl:[&:not(:first-child)]:border-l sm:px-5'

          return metric.link ? (
            <Link
              key={metric.label}
              {...metric.link}
              className={cn(
                className,
                'transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40',
              )}
            >
              {body}
            </Link>
          ) : (
            <div key={metric.label} className={className}>
              {body}
            </div>
          )
        })}
      </FramePanel>
    </Frame>
  )
}

function personName(
  person: { firstName: string | null; lastName: string | null } | null | undefined,
) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

function dayHeading(date: Date, now: Date) {
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

  const diff = Math.round((day(date) - day(now)) / 86_400_000)

  if (diff === 0) return copy.interviews.today

  if (diff === 1) return copy.interviews.tomorrow

  return dayLabel.format(date)
}

const INTERVIEW_LIMIT = 8

export function UpcomingInterviews({
  interviews,
  mine,
}: {
  interviews: Array<UpcomingInterview>
  mine: boolean
}) {
  // Fixed at mount, like RelativeTime: the day headings and "live" join buttons don't tick.
  const [now] = useState(() => Date.now())
  const shown = interviews.slice(0, INTERVIEW_LIMIT)
  const groups = new Map<string, Array<UpcomingInterview>>()

  for (const interview of shown) {
    const heading = interview.startsAt
      ? dayHeading(new Date(interview.startsAt), new Date(now))
      : ''

    groups.set(heading, [...(groups.get(heading) ?? []), interview])
  }

  return (
    <Panel
      title={copy.interviews.title}
      description={copy.interviews.description}
      action={<PanelLink to="/ats/interviews">{copy.interviews.viewAll}</PanelLink>}
    >
      {interviews.length === 0 ? (
        <EmptyLine>{mine ? copy.interviews.emptyMine : copy.interviews.empty}</EmptyLine>
      ) : (
        <div className="pb-2">
          {[...groups].map(([heading, rows]) => (
            <section key={heading}>
              <h3 className="border-t bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground sm:px-5">
                {heading}
              </h3>
              <ul className="divide-y">
                {rows.map((interview) => (
                  <InterviewRow key={interview.id} interview={interview} now={now} />
                ))}
              </ul>
            </section>
          ))}
          {interviews.length > shown.length ? (
            <p className="border-t px-4 pt-2 text-xs text-muted-foreground sm:px-5">
              {copy.interviews.more(interviews.length - shown.length)}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  )
}

function InterviewRow({ interview, now }: { interview: UpcomingInterview; now: number }) {
  const candidate = interview.applications?.candidates
  const job = interview.applications?.requisitions
  const name = personName(candidate)

  const live =
    interview.startsAt &&
    interview.endsAt &&
    now >= new Date(interview.startsAt).getTime() - 10 * 60_000 &&
    now <= new Date(interview.endsAt).getTime()

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="w-16 shrink-0 text-sm tabular-nums">
        <p className="font-medium">
          {interview.startsAt ? time.format(new Date(interview.startsAt)) : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {interview.endsAt ? time.format(new Date(interview.endsAt)) : ''}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {candidate?.id ? (
            <Link
              to="/ats/candidates/$candidateId"
              params={{ candidateId: candidate.id }}
              className="hover:underline"
            >
              {name}
            </Link>
          ) : (
            name
          )}
          <span className="font-normal text-muted-foreground">
            {' · '}
            {interview.interview_stages?.name ?? interview.title}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{job?.title}</p>
      </div>
      <People people={interview.participants} />
      {interview.meetingUrl ? (
        <Button
          variant={live ? 'default' : 'outline'}
          size="sm"
          nativeButton={false}
          render={
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={copy.interviews.joinLabel(interview.title ?? name)}
            />
          }
        >
          <Video data-icon="inline-start" />
          <span className="max-sm:sr-only">{copy.interviews.join}</span>
        </Button>
      ) : null}
    </li>
  )
}

function People({ people }: { people: Array<Member> }) {
  if (!people.length) return null
  const shown = people.slice(0, 3)

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="hidden shrink-0 -space-x-1.5 sm:flex" />}>
        {shown.map((person) => (
          <EntityAvatar
            key={person.id}
            label={ownerLabel(person)}
            image={avatarUrl(person.avatarId)}
            variant="circle"
            className="ring-2 ring-card"
          />
        ))}
      </TooltipTrigger>
      <TooltipContent>{people.map((person) => ownerLabel(person)).join(', ')}</TooltipContent>
    </Tooltip>
  )
}

export function JobsPanel({
  jobs,
  applications,
  mine,
}: {
  jobs: Array<OpenJob>
  applications: Array<ActiveApplication>
  mine: boolean
}) {
  const byStage = new Map<string, number>()

  for (const application of applications) {
    const key = `${application.requisitionId}:${application.interviewStageId}`
    byStage.set(key, (byStage.get(key) ?? 0) + 1)
  }

  return (
    <Panel
      title={copy.jobs.title}
      description={copy.jobs.description}
      action={<PanelLink to="/ats/jobs">{copy.jobs.viewAll}</PanelLink>}
    >
      {jobs.length === 0 ? (
        <EmptyLine>{mine ? copy.jobs.emptyMine : copy.jobs.empty}</EmptyLine>
      ) : (
        <ul className="divide-y border-t">
          {jobs.map((job) => {
            const stages = job.stages.map((stage) => ({
              ...stage,
              count: byStage.get(`${job.id}:${stage.id}`) ?? 0,
            }))

            const total = stages.reduce((sum, stage) => sum + stage.count, 0)

            return (
              <li
                key={job.id}
                className="grid gap-x-6 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <EntityAvatar
                    label={ownerLabel(job.hiringManager)}
                    image={avatarUrl(job.hiringManager?.avatarId)}
                    variant="circle"
                    size="default"
                  />
                  <div className="min-w-0">
                    <Link
                      to="/ats/jobs/$jobId"
                      params={{ jobId: job.id }}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono">REQ-{job.reqNumber}</span>
                      {job.departments?.name ? <span>· {job.departments.name}</span> : null}
                      {job.isConfidential ? (
                        <Badge variant="outline">{copy.jobs.confidential}</Badge>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 self-center">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium tabular-nums">{copy.jobs.candidates(total)}</span>
                  </div>
                  {stages.length ? (
                    <StageBar stages={stages} total={total} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{copy.jobs.noStages}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

// A cell per stage, in order, so an empty stage still holds its place and a pile-up shows.
function StageBar({
  stages,
  total,
}: {
  stages: Array<{ id: string; name: string | null; kind: string | null; count: number }>
  total: number
}) {
  const peak = Math.max(1, ...stages.map((stage) => stage.count))

  return (
    <ol className="flex gap-0.5" aria-label={copy.jobs.candidates(total)}>
      {stages.map((stage) => (
        <Tooltip key={stage.id}>
          <TooltipTrigger
            render={
              <li className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="relative h-6 overflow-hidden rounded-sm bg-muted">
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm transition-[height]"
                    style={{
                      height: `${stage.count ? Math.max(18, (stage.count / peak) * 100) : 0}%`,
                      backgroundColor: kindColor(stage.kind),
                    }}
                  />
                </span>
                <span className="text-center text-[11px] leading-none text-muted-foreground tabular-nums">
                  {stage.count}
                </span>
              </li>
            }
          />
          <TooltipContent>
            {stage.name}: {stage.count}
          </TooltipContent>
        </Tooltip>
      ))}
    </ol>
  )
}

export type AttentionItem = {
  application: ActiveApplication
  job: OpenJob
  stageName: string
  overdue: number
}

const ATTENTION_LIMIT = 6

export function NeedsAttention({ items }: { items: Array<AttentionItem> }) {
  const shown = items.slice(0, ATTENTION_LIMIT)

  return (
    <Panel
      id="needs-attention"
      title={copy.attention.title}
      description={copy.attention.description}
    >
      {items.length === 0 ? (
        <EmptyLine>{copy.attention.empty}</EmptyLine>
      ) : (
        <ul className="divide-y border-t">
          {shown.map(({ application, job, stageName, overdue }) => {
            const candidate = application.candidates
            const name = personName(candidate)

            return (
              <li key={application.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <EntityAvatar label={name} variant="circle" />
                <div className="min-w-0 flex-1">
                  {candidate?.id ? (
                    <Link
                      to="/ats/candidates/$candidateId"
                      params={{ candidateId: candidate.id }}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{name}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {stageName} · {job.title}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    'shrink-0 gap-1 tabular-nums',
                    overdue >= 7
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                  )}
                >
                  <Clock data-icon="inline-start" />
                  {copy.attention.overdue(overdue)}
                </Badge>
              </li>
            )
          })}
          {items.length > shown.length ? (
            <li className="px-4 py-2 text-xs text-muted-foreground sm:px-5">
              {copy.attention.more(items.length - shown.length)}
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  )
}

export function SourceMix({ applications }: { applications: Array<ActiveApplication> }) {
  const counts = new Map<string, number>()

  for (const application of applications) {
    const source = application.candidates?.source ?? 'sourced'
    counts.set(source, (counts.get(source) ?? 0) + 1)
  }

  const total = applications.length
  const rows = [...counts].sort((a, b) => b[1] - a[1])

  return (
    <Panel title={copy.sources.title} description={copy.sources.description}>
      {total === 0 ? (
        <EmptyLine>{copy.sources.empty}</EmptyLine>
      ) : (
        <div className="space-y-4 px-4 pb-4 sm:px-5">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {rows.map(([source, count]) => (
              <span
                key={source}
                style={{ flexGrow: count, backgroundColor: sourceColor(source) }}
                className="first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
          <ul className="space-y-2">
            {rows.map(([source, count]) => (
              <li key={source} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sourceColor(source) }}
                />
                <span className="min-w-0 flex-1 truncate">{optionLabel('source', source)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {copy.sources.share(count, Math.round((count / total) * 100))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

export type QuickLink = {
  label: string
  hint: string
  icon: ComponentType<{ className?: string }>
  link: LinkProps
}

export function QuickLinks({ links }: { links: Array<QuickLink> }) {
  return (
    <Panel title={copy.links.title}>
      <div className="grid grid-cols-2 gap-px border-t bg-border">
        {links.map((item) => (
          <Link
            key={item.label}
            {...item.link}
            className="group flex flex-col gap-2 bg-card p-4 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <item.icon className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="border-t px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
      {children}
    </p>
  )
}
