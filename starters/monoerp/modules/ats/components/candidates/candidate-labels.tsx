import { Link } from '@tanstack/react-router'
import { Layers, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'

import { EntityAvatar } from '@/components/avatars'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid } from '@/generated/monospace'
import { todayInput } from '@/lib/dates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'

const copy = atsCopy.candidates

export type CandidateLike = {
  id?: Uuid | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export function candidateName(candidate: CandidateLike | null | undefined) {
  return `${candidate?.firstName ?? ''} ${candidate?.lastName ?? ''}`.trim() || copy.singular
}

export function splitTags(tags: string | null | undefined) {
  return (tags ?? '').split(',').flatMap((tag) => (tag.trim() ? [tag.trim()] : []))
}

export function joinTags(tags: Array<string>) {
  const unique = [...new Set(tags.flatMap((tag) => (tag.trim() ? [tag.trim()] : [])))]

  return unique.length ? unique.join(', ') : null
}

// retain_until is a date column, so string order is date order.
export function isPastRetention(retainUntil: string | null | undefined, today = todayInput()) {
  return Boolean(retainUntil && retainUntil < today)
}

export function locationLabel(row: { city?: string | null; country?: string | null }) {
  return [row.city, row.country].filter(Boolean).join(', ')
}

// The source, plus who: the agency's name or the referring employee.
export function sourceLabel(row: { source?: string | null; sourceDetail?: string | null }) {
  const label = optionLabel('source', row.source)

  return row.sourceDetail ? `${label} · ${row.sourceDetail}` : label
}

export function CandidateAvatar({
  candidate,
  size = 'default',
  className,
}: {
  candidate: CandidateLike | null | undefined
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  return (
    <EntityAvatar
      label={candidateName(candidate)}
      variant="circle"
      size={size}
      className={className}
    />
  )
}

export function CandidateLabel({
  candidate,
  secondary,
  size = 'default',
  className,
}: {
  candidate: CandidateLike
  secondary?: string | null
  size?: 'sm' | 'default'
  className?: string
}) {
  const body = (
    <>
      <CandidateAvatar candidate={candidate} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium group-hover/entity:underline">
          {candidateName(candidate)}
        </span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
    </>
  )

  const classes = cn(
    'group/entity inline-flex max-w-full min-w-0 items-center gap-2 align-middle',
    className,
  )

  return candidate.id ? (
    <Link
      to="/ats/candidates/$candidateId"
      params={{ candidateId: candidate.id }}
      className={classes}
    >
      {body}
    </Link>
  ) : (
    <span className={classes}>{body}</span>
  )
}

export function TagList({
  tags,
  max,
  className,
}: {
  tags: string | null | undefined
  max?: number
  className?: string
}) {
  const all = splitTags(tags)
  const shown = max ? all.slice(0, max) : all
  const hidden = all.length - shown.length

  if (!all.length) return null

  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-1', className)}>
      {shown.map((tag) => (
        <Badge key={tag} variant="outline" className="font-normal">
          {tag}
        </Badge>
      ))}
      {hidden > 0 ? <span className="text-xs text-muted-foreground">+{hidden}</span> : null}
    </span>
  )
}

// `chip` renders the flag as a square chip, matching the profile header's source chip.
const CHIP = 'h-6 rounded-md px-2 [&>svg]:size-3.5!'

export function MultiJobBadge({ count, chip = false }: { count: number; chip?: boolean }) {
  if (count < 2) return null

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            className={cn(
              'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300',
              chip && CHIP,
            )}
          />
        }
      >
        <Layers />
        {copy.multiJob(count)}
      </TooltipTrigger>
      <TooltipContent>{copy.multiJobHint}</TooltipContent>
    </Tooltip>
  )
}

export function RetentionBadge({
  retainUntil,
  chip = false,
}: {
  retainUntil: string | null | undefined
  chip?: boolean
}) {
  if (!retainUntil || !isPastRetention(retainUntil)) return null

  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="destructive" className={cn(chip && CHIP)} />}>
        <ShieldAlert />
        {copy.pastRetention}
      </TooltipTrigger>
      <TooltipContent>{copy.pastRetentionHint(formatDate(retainUntil))}</TooltipContent>
    </Tooltip>
  )
}

export function ConsentStatus({
  consentAt,
  className,
}: {
  consentAt: string | null | undefined
  className?: string
}) {
  return consentAt ? (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <ShieldCheck className="size-3.5 text-success" />
      {formatDate(consentAt)}
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <ShieldQuestion className="size-3.5" />
      {copy.consent.awaiting}
    </span>
  )
}
