import { ThumbsDown, ThumbsUp, CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'

import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserAvatar, userName } from '@/components/users'
import type { OwnerLike } from '@/lib/users'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'

export const RECOMMENDATIONS = ['strong_yes', 'yes', 'undecided', 'no', 'strong_no'] as const

export type Recommendation = (typeof RECOMMENDATIONS)[number]

// Strong yes to strong no reads green to red, the strong ends filled.
const tone: Record<Recommendation, { badge: string; active: string; icon: ReactNode }> = {
  strong_yes: {
    badge: 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
    active:
      'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950',
    icon: (
      <span className="flex -space-x-1.5">
        <ThumbsUp />
        <ThumbsUp />
      </span>
    ),
  },
  yes: {
    badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    active: 'border-emerald-500 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    icon: <ThumbsUp />,
  },
  undecided: {
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    active: 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    icon: <CircleHelp />,
  },
  no: {
    badge: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
    active: 'border-rose-500 bg-rose-500/12 text-rose-700 dark:text-rose-300',
    icon: <ThumbsDown />,
  },
  strong_no: {
    badge: 'bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950',
    active:
      'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500 dark:text-rose-950',
    icon: (
      <span className="flex -space-x-1.5">
        <ThumbsDown />
        <ThumbsDown />
      </span>
    ),
  },
}

function isRecommendation(value: string | null | undefined): value is Recommendation {
  return RECOMMENDATIONS.some((item) => item === value)
}

export function RecommendationBadge({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  if (!isRecommendation(value)) return null

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
        tone[value].badge,
        className,
      )}
    >
      {tone[value].icon}
      {optionLabel('recommendation', value)}
    </span>
  )
}

// Five big buttons, one per answer. A radio group so arrow keys move between them.
export function RecommendationPicker({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  value: string
  onChange: (value: Recommendation) => void
  invalid?: boolean
  describedBy?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={atsCopy.interviews.scorecard.recommendation}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="grid grid-cols-5 gap-1.5 max-sm:grid-cols-1"
    >
      {RECOMMENDATIONS.map((item) => {
        const checked = value === item

        return (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(item)}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border bg-background px-1 py-2 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 max-sm:min-h-11 max-sm:flex-row max-sm:justify-start max-sm:px-3 max-sm:text-sm [&_svg]:size-4',
              checked ? tone[item].active : 'text-muted-foreground',
              invalid && !value && 'border-destructive/60',
            )}
          >
            {tone[item].icon}
            <span className="text-center leading-tight">{optionLabel('recommendation', item)}</span>
          </button>
        )
      })}
    </div>
  )
}

const STACK_LIMIT = 4

export function PeopleStack({
  people,
  size = 'sm',
}: {
  people: ReadonlyArray<OwnerLike | null>
  size?: 'sm' | 'default'
}) {
  const shown = people.slice(0, STACK_LIMIT)
  const extra = people.length - shown.length

  return (
    <AvatarGroup className="-space-x-1">
      {shown.map((person, index) => (
        <Tooltip key={person?.id ?? index}>
          <TooltipTrigger render={<span className="rounded-full" />}>
            <UserAvatar user={person} size={size} className="ring-2 ring-background" />
          </TooltipTrigger>
          <TooltipContent>{userName(person)}</TooltipContent>
        </Tooltip>
      ))}
      {extra > 0 ? <AvatarGroupCount className="text-xs">+{extra}</AvatarGroupCount> : null}
    </AvatarGroup>
  )
}
