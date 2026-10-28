import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { optionLabel } from '@/modules/ats/ats.copy'

// One tone per meaning, shared by plan lines, role requests, and approval steps.
const TONE = {
  waiting: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  good: 'bg-success/10 text-success dark:bg-success/20',
  bad: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  quiet: 'bg-muted text-muted-foreground',
}

const DOT = {
  waiting: 'bg-amber-500',
  good: 'bg-success',
  bad: 'bg-destructive',
  quiet: 'bg-muted-foreground/50',
}

type Tone = keyof typeof TONE

function toneFor(status: string): Tone {
  if (status === 'approved') return 'good'

  if (status === 'declined') return 'bad'

  if (status === 'draft') return 'quiet'

  return 'waiting'
}

function ToneBadge({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('gap-1.5', TONE[tone], className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />
      {label}
    </Badge>
  )
}

export function PlanStatusBadge({ status }: { status: string | null | undefined }) {
  const value = status ?? 'draft'

  return <ToneBadge tone={toneFor(value)} label={optionLabel('planStatus', value)} />
}

export function RequestStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined
  className?: string
}) {
  const value = status ?? 'submitted'

  return (
    <ToneBadge
      tone={toneFor(value)}
      label={optionLabel('requestStatus', value)}
      className={className}
    />
  )
}

export function DecisionBadge({ decision }: { decision: string | null | undefined }) {
  const value = decision ?? 'pending'

  return <ToneBadge tone={toneFor(value)} label={optionLabel('decision', value)} />
}
