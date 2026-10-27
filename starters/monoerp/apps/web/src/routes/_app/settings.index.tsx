import { createFileRoute, redirect } from '@tanstack/react-router'

import { modules } from '@/modules'

export const Route = createFileRoute('/_app/settings/')({
  beforeLoad: () => {
    const firstPage = modules.flatMap((module) => module.settings?.pages ?? [])[0]

    throw redirect({ href: firstPage ?? '/settings/account', replace: true })
  },
})
