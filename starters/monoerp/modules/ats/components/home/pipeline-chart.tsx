import { barX, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { Panel } from '@/modules/ats/components/home/dashboard-panels'
import { kindColor, stageKinds } from '@/modules/ats/components/home/stage-kinds'
import type { ActiveApplication, OpenJob } from '@/modules/ats/data/home'

const copy = atsCopy.home.dashboard.funnel

const chartTheme = {
  foreground: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  grid: 'var(--border)',
  background: 'transparent',
  palette: ['var(--primary)'],
} as const

type FunnelRow = { id: string; stage: string; count: number; color: string }

// Stage names differ per job, so the funnel across jobs is by stage kind, in pipeline order.
function funnelRows(jobs: Array<OpenJob>, applications: Array<ActiveApplication>) {
  const kindByStage = new Map<string, string | null>(
    jobs.flatMap((job) => job.stages.map((stage) => [stage.id, stage.kind])),
  )

  const counts = new Map<string, number>()

  for (const application of applications) {
    const kind = kindByStage.get(application.interviewStageId ?? '')

    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  return stageKinds.map((kind): FunnelRow => ({
    id: kind,
    stage: optionLabel('stageKind', kind),
    count: counts.get(kind) ?? 0,
    color: kindColor(kind),
  }))
}

export function PipelineChart({
  jobs,
  applications,
}: {
  jobs: Array<OpenJob>
  applications: Array<ActiveApplication>
}) {
  const rows = useMemo(() => funnelRows(jobs, applications), [jobs, applications])

  const chart = useMemo(
    () =>
      defineChart({
        marks: [
          barX(rows, {
            y: 'stage',
            x: 'count',
            key: 'id',
            fill: (row: FunnelRow) => row.color,
            inset: 3,
            maxThickness: 26,
            radius: 5,
          }),
        ],
        scales: {
          x: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: { count: 5 } } },
          y: { scale: () => scaleBand<string>().padding(0.15) },
        },
        theme: chartTheme,
        clip: true,
        svgAnimation: true,
        tooltip: {
          use: tooltip,
          items: [{ channel: 'x', label: copy.candidates, text: (point) => String(point.xValue) }],
        },
      }),
    [rows],
  )

  return (
    <Panel title={copy.title} description={copy.description}>
      {applications.length === 0 ? (
        <p className="border-t px-5 py-8 text-center text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="px-3 pb-3 sm:px-5 sm:pb-4">
          <Chart definition={chart} height={260} ariaLabel={copy.aria} className="crm-chart" />
        </div>
      )}
    </Panel>
  )
}
