import { Database } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import type { PortalEvent } from './portal'
import { eventLabel } from './portal'
import { portalCopy } from './portal.copy'

// A portal event in the history list, on the same grid as ActivityRow so the columns line
// up: no checkbox (nothing to select, it isn't ours), source icon, what happened, a Portal
// pill in the context slot, when. Read-only, so no hover actions and no click.
const GRID =
  'grid grid-cols-[1rem_1rem_minmax(0,1fr)_7.5rem_1.5rem] items-center gap-3 @2xl:grid-cols-[1rem_1rem_minmax(0,1fr)_12rem_7.5rem_1.5rem] @5xl:grid-cols-[1rem_1rem_minmax(0,1fr)_20rem_7.5rem_1.5rem]'

export function PortalEventRow({
  event,
  when,
  inset,
}: {
  event: PortalEvent
  when: string
  inset?: string
}) {
  return (
    <div className={cn('h-11', GRID, inset ?? 'px-5 sm:px-6')}>
      <span />
      <Database className="size-4 text-muted-foreground" />
      <p className="min-w-0 truncate text-sm">
        <span className="font-medium">{eventLabel(event.type)}</span>
        {event.detail ? <span className="text-muted-foreground"> · {event.detail}</span> : null}
        {event.user?.name ? (
          <span className="text-muted-foreground"> · {event.user.name}</span>
        ) : null}
      </p>
      <div className="hidden min-w-0 items-center @2xl:flex">
        <Badge variant="outline" className="font-normal">
          {portalCopy.organizations.portal.title}
        </Badge>
      </div>
      <div className="flex justify-end text-xs text-muted-foreground tabular-nums">{when}</div>
      <span />
    </div>
  )
}
