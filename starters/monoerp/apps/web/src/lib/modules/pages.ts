import { useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'

import type { PageMeta, RoutePath } from '@/lib/modules/types'

type Page = PageMeta & { to: RoutePath }

/** Every route that declares `staticData.page` and needs no params. */
export function usePages() {
  const router = useRouter()

  return useMemo(() => {
    const pages: Page[] = []

    for (const route of Object.values(router.routesById)) {
      const page = route.options.staticData?.page

      if (!page || route.fullPath.includes('$')) continue
      pages.push({ ...page, to: route.to })
    }

    return pages.sort((a, b) => (a.nav ?? Infinity) - (b.nav ?? Infinity))
  }, [router.routesById])
}
