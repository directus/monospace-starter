import { useEffect, useRef } from 'react'

// Fires `onVisible` when the sentinel scrolls into view, for loading the next page.
export function LoadMoreSentinel({
  enabled,
  onVisible,
}: {
  enabled: boolean
  onVisible: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(onVisible)
  useEffect(() => {
    latest.current = onVisible
  })
  useEffect(() => {
    const node = ref.current

    if (!node || !enabled) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current()
    })

    observer.observe(node)

    return () => observer.disconnect()
  }, [enabled])

  return <div ref={ref} className="h-px" />
}
