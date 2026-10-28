import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import type { PlanLine } from '@/modules/ats/data/requests'

const copy = atsCopy.requests.plan.overview

type Totals = PlanLine['progress']

function sum(lines: ReadonlyArray<PlanLine>): Totals {
  return lines.reduce(
    (total, line) => ({
      planned: total.planned + line.progress.planned,
      approved: total.approved + line.progress.approved,
      open: total.open + line.progress.open,
      hired: total.hired + line.progress.hired,
      remaining: total.remaining + line.progress.remaining,
    }),
    { planned: 0, approved: 0, open: 0, hired: 0, remaining: 0 },
  )
}

const STATS = [
  { key: 'planned', label: copy.planned },
  { key: 'approved', label: copy.approved },
  { key: 'open', label: copy.open },
  { key: 'hired', label: copy.hired },
  { key: 'remaining', label: copy.remaining },
] as const

// The spec's Workforce Planning Overview: per role, what was planned and approved, what's open,
// who's been hired, and what's left to hire.
export function PlanOverview({ lines }: { lines: ReadonlyArray<PlanLine> }) {
  const totals = sum(lines)
  const rows = lines.filter((line) => line.progress.planned || line.progress.approved)

  return (
    <Frame>
      <FrameHeader className="px-4 pt-3 pb-2">
        <FrameTitle>{copy.title}</FrameTitle>
        <FrameDescription className="text-xs">{copy.description}</FrameDescription>
      </FrameHeader>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {STATS.map((stat) => (
          <FramePanel key={stat.key} className="px-3 py-2.5 sm:px-4 sm:py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              {totals[stat.key]}
            </p>
          </FramePanel>
        ))}
      </div>
      {rows.length ? (
        <FramePanel className="max-h-80 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="pl-4">{atsCopy.requests.plan.columns.role}</TableHead>
                {STATS.map((stat) => (
                  <TableHead key={stat.key} className="text-right">
                    {stat.label}
                  </TableHead>
                ))}
                <TableHead className="w-48 pr-4 max-md:hidden">{copy.progress}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{line.roleName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[line.departments?.name, line.team].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  {STATS.map((stat) => (
                    <TableCell
                      key={stat.key}
                      className={cn(
                        'text-right tabular-nums',
                        !line.progress[stat.key] && 'text-muted-foreground/60',
                      )}
                    >
                      {line.progress[stat.key]}
                    </TableCell>
                  ))}
                  <TableCell className="pr-4 max-md:hidden">
                    <HireProgress progress={line.progress} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </FramePanel>
      ) : null}
    </Frame>
  )
}

function HireProgress({ progress }: { progress: Totals }) {
  if (!progress.approved) {
    return <span className="text-xs text-muted-foreground">{copy.nothingApproved}</span>
  }

  const hired = Math.min(progress.hired / progress.approved, 1)
  const open = Math.min(progress.open / progress.approved, 1 - hired)

  return (
    <div className="space-y-1">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="bg-success" style={{ width: `${hired * 100}%` }} />
        <div className="bg-sky-500/70" style={{ width: `${open * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {copy.hiredOf(progress.hired, progress.approved)}
      </p>
    </div>
  )
}
