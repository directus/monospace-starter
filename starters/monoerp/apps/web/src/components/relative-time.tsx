import { useState } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

// "3 hours ago" in the row, the full timestamp on hover. `now` is fixed at mount so the
// label doesn't drift mid-render; a page this old gets refreshed anyway. Touch screens have no
// hover, so a tap swaps the label for the full timestamp instead.
export function RelativeTime({
  value,
  className,
}: {
  value: string | null | undefined
  className?: string
}) {
  const [now] = useState(() => Date.now())
  const [full, setFull] = useState(false)

  if (!value) return null

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={value}
            className={cn('cursor-default', className)}
            onClick={(event) => {
              if (!window.matchMedia('(pointer: coarse)').matches) return
              // Rows around it are often clickable (e.g. a ticket opens its drawer).
              event.stopPropagation()
              setFull((shown) => !shown)
            }}
          />
        }
      >
        {full ? formatDateTime(value) : formatRelative(value, now)}
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(value)}</TooltipContent>
    </Tooltip>
  )
}
