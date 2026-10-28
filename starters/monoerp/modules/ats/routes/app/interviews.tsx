import { noop, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarCheck2, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { z } from 'zod'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { sessionQuery, useCurrentUser } from '@/lib/auth'
import { atsCopy } from '@/modules/ats/ats.copy'
import { localDateInput } from '@/modules/ats/components/interviews/interview-helpers'
import { InterviewList } from '@/modules/ats/components/interviews/interview-list'
import { interviewsBoardQuery } from '@/modules/ats/data/interviews'
import type { InterviewRow } from '@/modules/ats/data/interviews'
import { InterviewIcon } from '@/modules/ats/icons'

const copy = atsCopy.interviews

const searchSchema = z.object({
  scope: z.enum(['mine', 'all']).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/ats/interviews')({
  staticData: {
    page: {
      title: copy.title,
      icon: InterviewIcon,
      module: 'ats',
      nav: 40,
      keywords: [...copy.keywords],
    },
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ scope: search.scope ?? 'mine' }),
  loader: async ({ context: { queryClient }, deps }) => {
    const user = await queryClient.query({ ...sessionQuery(), staleTime: 'static' })
    const board = interviewsBoardQuery(deps.scope === 'all' ? null : user.id)

    await queryClient.query({ ...board, staleTime: 'static' }).catch(noop)
  },
  component: InterviewsPage,
})

const weekday = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

function dayLabel(key: string, today: string, tomorrow: string) {
  if (key === today) return copy.today

  if (key === tomorrow) return copy.tomorrow

  const [year, month, day] = key.split('-').map(Number)

  return weekday.format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1))
}

function byDay(rows: Array<InterviewRow>) {
  const groups = new Map<string, Array<InterviewRow>>()

  for (const row of rows) {
    const key = localDateInput(new Date(row.startsAt ?? 0))
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return [...groups.entries()]
}

function InterviewsPage() {
  const { scope = 'mine' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const me = useCurrentUser()
  const board = useQuery(interviewsBoardQuery(scope === 'all' ? null : (me?.id ?? null)))
  const [today] = useState(() => localDateInput(new Date()))

  const [tomorrow] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 1)

    return localDateInput(date)
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Tabs
            value={scope}
            onValueChange={(value) =>
              navigate({ search: { scope: value === 'all' ? 'all' : undefined } })
            }
          >
            <TabsList>
              <TabsTrigger value="mine">{copy.scope.mine}</TabsTrigger>
              <TabsTrigger value="all">{copy.scope.all}</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {board.isPending ? (
        <DataLoading rows={6} />
      ) : board.isError ? (
        <DataError error={board.error} />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Section
            title={copy.thisWeek}
            count={board.data.upcoming.length}
            icon={<CalendarCheck2 className="size-4" />}
          >
            {board.data.upcoming.length ? (
              <div className="space-y-5">
                {byDay(board.data.upcoming).map(([key, rows]) => (
                  <div key={key} className="space-y-2">
                    <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {dayLabel(key, today, tomorrow)}
                    </h3>
                    <InterviewList interviews={rows} showCandidate showScorecards={false} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty>{copy.noUpcoming}</Empty>
            )}
          </Section>

          <Section
            title={copy.owed}
            hint={copy.owedHint}
            count={board.data.owed.length}
            icon={<ClipboardCheck className="size-4" />}
            highlight={board.data.owed.length > 0}
          >
            {board.data.owed.length ? (
              <InterviewList interviews={board.data.owed} showCandidate showScorecards={false} />
            ) : (
              <Empty>{copy.noOwed}</Empty>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  count,
  icon,
  highlight = false,
  children,
}: {
  title: string
  hint?: string
  count: number
  icon: ReactNode
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <header className="space-y-0.5">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-muted-foreground">{icon}</span>
          {title}
          <span
            className={
              highlight
                ? 'rounded-full bg-amber-500/15 px-1.5 text-xs text-amber-700 tabular-nums dark:text-amber-300'
                : 'text-xs text-muted-foreground tabular-nums'
            }
          >
            {count}
          </span>
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
