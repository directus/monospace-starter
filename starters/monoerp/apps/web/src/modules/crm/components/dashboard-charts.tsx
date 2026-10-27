import { areaY, barX, barY, defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatMoney } from '@/lib/format'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { DealRow } from '@/modules/crm/data'
import { dealsByCurrency } from '@/modules/crm/deals'

const monthLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const shortMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

const chartTheme = {
  foreground: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  grid: 'var(--border)',
  background: 'transparent',
  palette: ['var(--primary)'],
} as const

type PipelineStageRow = {
  id: string
  stage: string
  position: number
  value: number
  count: number
}

type ForecastMonthRow = {
  id: string
  month: string
  shortMonth: string
  value: number
  count: number
}

export function DashboardCharts({ deals }: { deals: Array<DealRow> }) {
  const groups = dealsByCurrency(deals)

  if (!groups.length) return <CurrencyCharts deals={[]} currency="USD" />

  return (
    <div className="space-y-6">
      {groups.map(([currency, deals]) => (
        <section key={currency} className="space-y-3" aria-label={currency}>
          <h2 className="text-sm font-medium text-muted-foreground">{currency}</h2>
          <CurrencyCharts deals={deals} currency={currency} />
        </section>
      ))}
    </div>
  )
}

function CurrencyCharts({ deals, currency }: { deals: Array<DealRow>; currency: string }) {
  const pipelineRows = useMemo(() => groupPipelineByStage(deals), [deals])
  const forecastRows = useMemo(() => groupOpenPipelineByMonth(deals), [deals])
  // Phones get horizontal stage bars, short money and month labels, and no y-axis title.
  const compact = useIsMobile()

  const pipelineChart = useMemo(
    () => createPipelineChart(pipelineRows, currency),
    [pipelineRows, currency],
  )

  const compactPipelineChart = useMemo(
    () => createCompactPipelineChart(pipelineRows, currency),
    [pipelineRows, currency],
  )

  const forecastChart = useMemo(
    () => createForecastChart(forecastRows, compact, currency),
    [forecastRows, compact, currency],
  )

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Frame dense>
        <FramePanel>
          <FrameHeader>
            <FrameTitle>{crmCopy.dashboard.pipelineByStage.title}</FrameTitle>
            <FrameDescription>{crmCopy.dashboard.pipelineByStage.description}</FrameDescription>
          </FrameHeader>
          <div className="px-3 pb-3 sm:px-5 sm:pb-5">
            {compact ? (
              <Chart
                definition={compactPipelineChart}
                height={300}
                ariaLabel={crmCopy.dashboard.pipelineByStage.aria}
                className="crm-chart"
              />
            ) : (
              <Chart
                definition={pipelineChart}
                height={300}
                ariaLabel={crmCopy.dashboard.pipelineByStage.aria}
                className="crm-chart"
              />
            )}
          </div>
        </FramePanel>
      </Frame>

      <Frame dense>
        <FramePanel>
          <FrameHeader>
            <FrameTitle>{crmCopy.dashboard.forecast.title}</FrameTitle>
            <FrameDescription>{crmCopy.dashboard.forecast.description}</FrameDescription>
          </FrameHeader>
          <div className="px-3 pb-3 sm:px-5 sm:pb-5">
            <Chart
              definition={forecastChart}
              height={300}
              ariaLabel={crmCopy.dashboard.forecast.aria}
              className="crm-chart"
            />
          </div>
        </FramePanel>
      </Frame>
    </div>
  )
}

function groupPipelineByStage(deals: Array<DealRow>) {
  const stages = new Map<string, PipelineStageRow>()

  for (const opportunity of deals) {
    const stage = opportunity.pipeline_stages
    const id = stage?.id ?? stage?.name ?? 'restricted-stage'

    const existing = stages.get(id) ?? {
      id,
      stage: stage?.name ?? crmCopy.deals.restrictedStage,
      position: stage?.position ?? Number.MAX_SAFE_INTEGER,
      value: 0,
      count: 0,
    }

    existing.value += numericValue(opportunity.valueAmount)
    existing.count += 1
    stages.set(id, existing)
  }

  return [...stages.values()].sort((a, b) => a.position - b.position)
}

function groupOpenPipelineByMonth(deals: Array<DealRow>) {
  const months = new Map<string, ForecastMonthRow>()

  for (const opportunity of deals) {
    if (opportunity.status !== 'open' || !opportunity.expectedCloseDate) continue

    const id = opportunity.expectedCloseDate.slice(0, 7)

    const existing = months.get(id) ?? {
      id,
      month: monthLabel.format(new Date(`${id}-01T00:00:00Z`)),
      shortMonth: shortMonthLabel.format(new Date(`${id}-01T00:00:00Z`)),
      value: 0,
      count: 0,
    }

    existing.value += numericValue(opportunity.valueAmount)
    existing.count += 1
    months.set(id, existing)
  }

  return [...months.values()].sort((a, b) => a.id.localeCompare(b.id))
}

function numericValue(value: string | null | undefined) {
  const number = Number(value ?? 0)

  return Number.isFinite(number) ? number : 0
}

function moneyTicks(currency: string) {
  return { count: 4, format: (value: number) => formatMoney(String(value), currency) }
}

function createPipelineChart(rows: Array<PipelineStageRow>, currency: string) {
  return defineChart({
    marks: [
      barY(rows, {
        x: 'stage',
        y: 'value',
        key: 'id',
        fill: 'var(--primary)',
        inset: 2,
        maxThickness: 56,
        radius: 6,
      }),
    ],
    scales: {
      x: { scale: () => scaleBand<string>().padding(0.12) },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: crmCopy.dashboard.pipelineByStage.value },
      },
    },
    theme: chartTheme,
    clip: true,
    svgAnimation: true,
    tooltip: {
      use: tooltip,
      items: [
        {
          channel: 'y',
          label: crmCopy.dashboard.pipelineByStage.value,
          text: (point) => formatMoney(String(point.yValue), currency),
        },
        { field: 'count', label: crmCopy.dashboard.dealCount },
      ],
    },
  })
}

// Phone version: stage names read left to right instead of colliding under narrow columns.
function createCompactPipelineChart(rows: Array<PipelineStageRow>, currency: string) {
  return defineChart({
    marks: [
      barX(rows, {
        y: 'stage',
        x: 'value',
        key: 'id',
        fill: 'var(--primary)',
        inset: 2,
        maxThickness: 28,
        radius: 6,
      }),
    ],
    scales: {
      x: { scale: scaleLinear, nice: true, grid: true, axis: { ticks: moneyTicks(currency) } },
      y: { scale: () => scaleBand<string>().padding(0.12) },
    },
    theme: chartTheme,
    clip: true,
    svgAnimation: true,
    tooltip: {
      use: tooltip,
      items: [
        {
          channel: 'x',
          label: crmCopy.dashboard.pipelineByStage.value,
          text: (point) => formatMoney(String(point.xValue), currency),
        },
        { field: 'count', label: crmCopy.dashboard.dealCount },
      ],
    },
  })
}

function createForecastChart(rows: Array<ForecastMonthRow>, compact: boolean, currency: string) {
  const shortMonths = new Map(rows.map((row) => [row.month, row.shortMonth]))

  return defineChart({
    marks: [
      areaY(rows, {
        x: 'month',
        y: 'value',
        key: 'id',
        fill: 'url(#forecast-fill)',
      }),
      lineY(rows, {
        x: 'month',
        y: 'value',
        key: 'id',
        points: true,
        stroke: 'var(--primary)',
        strokeWidth: 2,
      }),
    ],
    scales: {
      x: {
        scale: () => scalePoint<string>().padding(0.3),
        axis: compact
          ? {
              ticks: {
                format: (month: string) => shortMonths.get(month) ?? month,
              },
            }
          : undefined,
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: compact
          ? { ticks: moneyTicks(currency) }
          : { label: crmCopy.dashboard.forecast.value },
      },
    },
    gradients: [
      {
        id: 'forecast-fill',
        x1: 0,
        y1: 1,
        x2: 0,
        y2: 0,
        stops: [
          { offset: 0, color: 'var(--primary)', opacity: 0.03 },
          { offset: 1, color: 'var(--primary)', opacity: 0.28 },
        ],
      },
    ],
    theme: chartTheme,
    clip: true,
    focus: 'nearest-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    svgAnimation: true,
    tooltip: {
      use: tooltip,
      items: [
        {
          channel: 'y',
          label: crmCopy.dashboard.forecast.value,
          text: (point) => formatMoney(String(point.yValue), currency),
        },
        { field: 'count', label: crmCopy.dashboard.dealCount },
      ],
    },
  })
}
