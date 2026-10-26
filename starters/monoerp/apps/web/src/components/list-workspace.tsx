import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { ListTitle } from '@/components/list-toolbar'

// Full-width list pages keep their heading and controls outside the scrolling data viewport.
// The table or board gets every remaining pixel and owns its own scroll position.
// Phones scroll the whole page instead, so the title scrolls away and only the controls stick.
// Sticky headers inside the list offset themselves by `--list-controls-height` there.
export function ListWorkspace({
  title,
  icon,
  controls,
  children,
}: {
  title: string
  icon?: LucideIcon
  controls: ReactNode
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const node = controlsRef.current

    if (!root || !node) return

    const observer = new ResizeObserver(() => {
      root.style.setProperty('--list-controls-height', `${node.offsetHeight}px`)
    })

    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col max-md:overflow-y-auto">
      <ListTitle title={title} icon={icon} className="px-4 pt-4 sm:px-6 lg:hidden" />
      <div
        ref={controlsRef}
        className="relative z-20 shrink-0 space-y-3 bg-background px-4 py-4 max-md:sticky max-md:top-0 sm:px-6"
      >
        {controls}
      </div>
      <div className="flex flex-1 flex-col md:min-h-0">{children}</div>
    </div>
  )
}
