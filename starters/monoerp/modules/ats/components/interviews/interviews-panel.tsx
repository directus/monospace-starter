import { useQuery } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { Button } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'
import { readyToInterview } from '@/modules/ats/components/interviews/interview-helpers'
import { InterviewList } from '@/modules/ats/components/interviews/interview-list'
import { ScheduleInterviewDrawer } from '@/modules/ats/components/interviews/schedule-drawer'
import { candidateApplicationsQuery, candidateInterviewsQuery } from '@/modules/ats/data/interviews'
import { InterviewIcon } from '@/modules/ats/icons'

const copy = atsCopy.interviews

// A candidate's interviews, next ones first, then past ones with their scorecards.
export function InterviewsPanel({ candidateId }: { candidateId: Uuid }) {
  const interviews = useQuery(candidateInterviewsQuery(candidateId))
  const applications = useQuery(candidateApplicationsQuery(candidateId))
  // Past interviewing (offer and later) the button stays, but quietly.
  const suggest = (applications.data ?? []).some(readyToInterview)
  const [scheduling, setScheduling] = useState(false)
  const [now] = useState(() => Date.now())

  const rows = interviews.data ?? []

  const upcoming = rows
    .filter((row) => row.status !== 'cancelled' && new Date(row.startsAt ?? 0).getTime() > now)
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))

  const past = rows.filter((row) => !upcoming.includes(row))

  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{copy.title}</h2>
        <Button
          size="sm"
          variant={suggest ? 'default' : 'outline'}
          onClick={() => setScheduling(true)}
        >
          <CalendarPlus data-icon="inline-start" />
          {copy.actions.schedule}
        </Button>
      </header>

      {interviews.isPending ? (
        <DataLoading rows={3} />
      ) : interviews.isError ? (
        <DataError error={interviews.error} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <InterviewIcon className="size-6 text-muted-foreground" />
          <p className="font-medium">{copy.noInterviews}</p>
          <p className="text-sm text-muted-foreground">
            {suggest ? copy.noInterviewsHint : copy.pastInterviewing}
          </p>
          {suggest ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setScheduling(true)}
            >
              <CalendarPlus data-icon="inline-start" />
              {copy.actions.schedule}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {upcoming.length ? (
            <Group title={copy.upcoming} count={upcoming.length}>
              <InterviewList interviews={upcoming} />
            </Group>
          ) : null}
          {past.length ? (
            <Group title={copy.past} count={past.length}>
              <InterviewList interviews={past} />
            </Group>
          ) : null}
        </>
      )}

      <ScheduleInterviewDrawer
        open={scheduling}
        onOpenChange={setScheduling}
        candidateId={candidateId}
      />
    </section>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <span className="tabular-nums">{count}</span>
      </h3>
      {children}
    </div>
  )
}
