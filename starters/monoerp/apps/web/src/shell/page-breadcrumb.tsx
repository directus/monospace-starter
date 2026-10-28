import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { BreadcrumbPage } from '@/components/ui/breadcrumb'
import { appCopy } from '@/lib/app.copy'
import type { PageMeta } from '@/lib/modules/types'

export function PageBreadcrumb({
  page,
  params,
}: {
  page: PageMeta
  params: Record<string, string>
}) {
  const queryClient = useQueryClient()

  const subscribe = useCallback(
    (listener: () => void) => queryClient.getQueryCache().subscribe(listener),
    [queryClient],
  )

  const readTitle = useCallback(
    () => page.recordTitle?.(queryClient, params),
    [page, queryClient, params],
  )

  const recordTitle = useSyncExternalStore(subscribe, readTitle, readTitle)
  const title = page.recordTitle ? recordTitle : page.title
  const browserTitle = recordTitle ? `${recordTitle} · ${appCopy.app.name}` : appCopy.app.name

  useEffect(() => {
    document.title = browserTitle

    return () => {
      document.title = appCopy.app.name
    }
  }, [browserTitle])

  return (
    <BreadcrumbPage
      className="block min-w-0 truncate"
      title={title}
      aria-busy={title === undefined || undefined}
      aria-label={title === undefined ? appCopy.data.loading : undefined}
    >
      {title ?? (
        <span aria-hidden="true" className="block h-4 w-24 animate-pulse rounded bg-muted" />
      )}
    </BreadcrumbPage>
  )
}
