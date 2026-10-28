import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, CalendarPlus, Lock, TimerReset, Video } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { RelativeTime } from '@/components/relative-time'
import { Button } from '@/components/ui/button'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  ApplicationStatusBadge,
  daysSince,
} from '@/modules/ats/components/candidates/applications-panel'
import { summary, useCandidateAudit } from '@/modules/ats/components/candidates/history-panel'
import { OfferCallout, needsOfferCallout } from '@/modules/ats/components/candidates/offer-callout'
import { StageProgress } from '@/modules/ats/components/candidates/stage-progress'
import {
  PeopleStack,
  RecommendationBadge,
} from '@/modules/ats/components/interviews/recommendation'
import { candidateNotesQuery } from '@/modules/ats/data/candidates'
import type { CandidateApplication, CandidateOffer } from '@/modules/ats/data/candidates'
import { candidateInterviewsQuery } from '@/modules/ats/data/interviews'
import type { InterviewRow } from '@/modules/ats/data/interviews'

const copy = atsCopy.candidates.overview

const INTERVIEW_KINDS = new Set(['application', 'screen', 'interview', 'debrief'])

export type OverviewTab = 'applications' | 'interviews' | 'notes' | 'history'

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

const month = new Intl.DateTimeFormat('en-US', { month: 'short' })

const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

// The profile at a glance: where they are on each job, what's next, what interviewers
// thought, and the latest notes and changes. Each card links to the tab with the full list.
export function OverviewPanel({
  candidateId,
  applications,
  offers,
  onOpenOffer,
  onOpenTab,
  onAddToJob,
}: {
  candidateId: Uuid
  applications: Array<CandidateApplication>
  offers: Array<CandidateOffer>
  onOpenOffer: (applicationId: Uuid) => void
  onOpenTab: (tab: OverviewTab) => void
  onAddToJob: () => void
}) {
  const interviews = useQuery(candidateInterviewsQuery(candidateId))
  const notes = useQuery(candidateNotesQuery(candidateId))
  const { events, names } = useCandidateAudit(candidateId, applications)
  const [now] = useState(() => Date.now())

  const next = (interviews.data ?? [])
    .filter(
      (interview) =>
        interview.status === 'scheduled' && new Date(interview.endsAt ?? 0).getTime() > now,
    )
    .sort((left, right) => (left.startsAt ?? '').localeCompare(right.startsAt ?? ''))[0]

  const scorecards = (interviews.data ?? [])
    .flatMap((interview) => interview.scorecards.map((scorecard) => ({ scorecard, interview })))
    .sort((left, right) =>
      (right.scorecard.submittedAt ?? '').localeCompare(left.scorecard.submittedAt ?? ''),
    )

  // Offer, background check, and hired are form steps; nothing there needs an interview booked.
  const interviewing = applications.some(
    (application) =>
      application.status === 'active' &&
      INTERVIEW_KINDS.has(
        application.stages.find((stage) => stage.id === application.interviewStageId)?.kind ?? '',
      ),
  )

  const offerCallouts = applications.flatMap((application) => {
    const offer = offers.find((row) => row.applicationId === application.id)

    return needsOfferCallout(application, offer) ? [{ application, offer }] : []
  })

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      {offerCallouts.map(({ application, offer }) => (
        <OfferCallout
          key={application.id}
          application={application}
          offer={offer}
          showJob
          onOpen={() => onOpenOffer(application.id)}
          className="md:col-span-2"
        />
      ))}
      <Card
        title={copy.pipeline}
        className="md:col-span-2"
        action={
          applications.length ? (
            <ViewAll onClick={() => onOpenTab('applications')} />
          ) : (
            <Button variant="ghost" size="sm" onClick={onAddToJob}>
              {copy.addToJob}
            </Button>
          )
        }
      >
        {applications.length ? (
          <ul className="divide-y">
            {applications.map((application) => (
              <PipelineRow key={application.id} application={application} now={now} />
            ))}
          </ul>
        ) : (
          <Empty>{copy.noApplications}</Empty>
        )}
      </Card>

      <Card title={copy.nextInterview} action={<ViewAll onClick={() => onOpenTab('interviews')} />}>
        {next ? (
          <NextInterview interview={next} />
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-sm text-muted-foreground">{copy.noInterview}</span>
            {interviewing ? (
              <Button variant="outline" size="sm" onClick={() => onOpenTab('interviews')}>
                <CalendarPlus data-icon="inline-start" />
                {copy.schedule}
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      <Card
        title={copy.scorecards}
        count={scorecards.length}
        action={scorecards.length ? <ViewAll onClick={() => onOpenTab('interviews')} /> : null}
      >
        {scorecards.length ? (
          <ul className="divide-y">
            {scorecards.slice(0, 3).map(({ scorecard, interview }) => (
              <li key={scorecard.id} className="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar user={scorecard.interviewer} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{userName(scorecard.interviewer)}</p>
                  <p className="truncate text-xs text-muted-foreground">{interview.title}</p>
                </div>
                <RecommendationBadge value={scorecard.recommendation} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{copy.noScorecards}</Empty>
        )}
      </Card>

      <Card
        title={copy.notes}
        count={notes.data?.length}
        action={<ViewAll onClick={() => onOpenTab('notes')} />}
      >
        {notes.data?.length ? (
          <ul className="divide-y">
            {notes.data.slice(0, 3).map((note) => (
              <li key={note.id} className="space-y-1 px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {note.createdBy
                      ? userName(note.createdBy)
                      : atsCopy.candidates.notes.unknownAuthor}
                  </span>
                  <RelativeTime value={note.createdAt} />
                  {note.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <Lock className="size-3" />
                      {atsCopy.candidates.notes.privateBadge}
                    </span>
                  ) : null}
                </p>
                <p className="line-clamp-2 text-sm">{note.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{notes.isPending ? copy.loading : copy.noNotes}</Empty>
        )}
      </Card>

      <Card title={copy.activity} action={<ViewAll onClick={() => onOpenTab('history')} />}>
        {events.data?.length ? (
          <ul className="space-y-0.5 px-4 py-2.5">
            {events.data.slice(0, 5).map((event) => (
              <li key={event.id} className="flex items-baseline gap-3 py-1 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {event.actorUser
                      ? userName(event.actorUser)
                      : atsCopy.candidates.history.system}
                  </span>{' '}
                  <span className="text-muted-foreground">{summary(event, names)}</span>
                </span>
                <RelativeTime
                  value={event.occurredAt}
                  className="shrink-0 text-xs text-muted-foreground"
                />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{events.isPending ? copy.loading : copy.noActivity}</Empty>
        )}
      </Card>
    </div>
  )
}

function PipelineRow({ application, now }: { application: CandidateApplication; now: number }) {
  const job = application.requisitions
  const status = application.status ?? 'active'
  const current = application.stages.find((stage) => stage.id === application.interviewStageId)
  const days = daysSince(application.stageEnteredAt, now)
  const overSla = status === 'active' && current?.slaDays != null && days > current.slaDays

  return (
    <li className="space-y-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {job?.id ? (
          <Link
            to="/ats/jobs/$jobId"
            params={{ jobId: job.id }}
            className="truncate text-sm font-semibold hover:underline"
          >
            {job.title}
          </Link>
        ) : null}
        <ApplicationStatusBadge status={status} />
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {status === 'active' ? (
            <span
              className={cn(
                'inline-flex items-center gap-1',
                overSla && 'font-medium text-amber-700 dark:text-amber-400',
              )}
            >
              <TimerReset className="size-3.5" />
              {atsCopy.candidates.applications.daysInStage(days)}
            </span>
          ) : status === 'rejected' && application.rejectionReason ? (
            atsCopy.candidates.applications.rejectedBecause(application.rejectionReason)
          ) : null}
        </span>
      </div>
      <StageProgress
        stages={application.stages}
        currentStageId={application.interviewStageId}
        stopped={status === 'rejected' || status === 'withdrawn'}
      />
    </li>
  )
}

function NextInterview({ interview }: { interview: InterviewRow }) {
  const start = new Date(interview.startsAt ?? '')
  const end = new Date(interview.endsAt ?? '')

  return (
    <div className="flex gap-3 px-4 py-3.5">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5 leading-none">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">
          {weekday.format(start)}
        </span>
        <span className="mt-1 text-lg font-semibold tabular-nums">{start.getDate()}</span>
        <span className="mt-0.5 text-[10px] text-muted-foreground uppercase">
          {month.format(start)}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-sm font-medium">{interview.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {time.format(start)} – {time.format(end)}
          {interview.applications?.requisitions?.title
            ? ` · ${interview.applications.requisitions.title}`
            : ''}
        </p>
        <div className="flex items-center gap-2">
          <PeopleStack people={interview.participants.map((participant) => participant.user)} />
          {interview.meetingUrl ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              nativeButton={false}
              render={<a href={interview.meetingUrl} target="_blank" rel="noreferrer" />}
            >
              <Video data-icon="inline-start" />
              {copy.join}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Card({
  title,
  count,
  action,
  className,
  children,
}: {
  title: string
  count?: number
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card shadow-xs', className)}>
      <header className="flex h-11 items-center gap-2 border-b px-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {count ? (
          <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">
            {count}
          </span>
        ) : null}
        <span className="ml-auto">{action}</span>
      </header>
      {children}
    </section>
  )
}

function ViewAll({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={onClick}>
      {copy.viewAll}
      <ArrowRight data-icon="inline-end" />
    </Button>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3.5 text-sm text-muted-foreground">{children}</p>
}
