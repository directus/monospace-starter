import { ChevronDown, Flame } from 'lucide-react'
import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { optionLabel } from '@/modules/ats/ats.copy'
import { kindColor } from '@/modules/ats/components/home/stage-kinds'

const STATUS_TONE = new Map([
  ['draft', 'bg-muted text-muted-foreground'],
  ['open', 'bg-success/10 text-success dark:bg-success/20'],
  ['on_hold', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
  ['closed', 'bg-secondary text-secondary-foreground'],
])

const STATUS_DOT = new Map([
  ['draft', 'bg-muted-foreground/50'],
  ['open', 'bg-success'],
  ['on_hold', 'bg-amber-500'],
  ['closed', 'bg-muted-foreground'],
])

export function JobStatusBadge({
  status,
  menu = false,
  className,
}: {
  status: string | null | undefined
  // Shows a chevron inside the chip when it opens a status menu.
  menu?: boolean
  className?: string
}) {
  const value = status ?? 'draft'

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1.5 align-middle', STATUS_TONE.get(value), className)}
    >
      <span className={cn('size-1.5 rounded-full', STATUS_DOT.get(value))} aria-hidden />
      {optionLabel('requisitionStatus', value)}
      {menu ? <ChevronDown data-icon="inline-end" className="opacity-60" /> : null}
    </Badge>
  )
}

const URGENCY_TONE = new Map([
  ['critical', 'bg-destructive/10 text-destructive dark:bg-destructive/20'],
  ['high', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
  ['normal', 'text-muted-foreground'],
  ['flexible', 'text-muted-foreground'],
])

export function UrgencyBadge({ urgency }: { urgency: string | null | undefined }) {
  if (!urgency) return null
  const loud = urgency === 'critical' || urgency === 'high'

  return (
    <Badge
      variant={loud ? 'secondary' : 'ghost'}
      className={cn('align-middle', URGENCY_TONE.get(urgency), !loud && 'px-0')}
    >
      {loud ? <Flame data-icon="inline-start" /> : null}
      {optionLabel('urgency', urgency)}
    </Badge>
  )
}

// Interview stages have no color of their own; their kind picks one (the dashboard's colors), so
// the board, the stage chips, and the plan agree.
export function stageKindStyle(kind: string | null | undefined): CSSProperties {
  return { '--stage': kindColor(kind) }
}

export function StageKindDot({
  kind,
  className,
}: {
  kind: string | null | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('size-2.5 shrink-0 rounded-full bg-(--stage)', className)}
      style={stageKindStyle(kind)}
    />
  )
}
