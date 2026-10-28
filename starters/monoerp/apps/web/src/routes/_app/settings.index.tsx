import { createFileRoute, Navigate } from '@tanstack/react-router'

import { modules } from '@/lib/modules'
import { isSettingsPage, usePages } from '@/lib/modules/pages'

export const Route = createFileRoute('/_app/settings/')({
  component: SettingsIndex,
})

function SettingsIndex() {
  const pages = usePages()

  const firstPage = modules
    .flatMap((module) => pages.filter((page) => isSettingsPage(page.to, module.id)))
    .at(0)

  return <Navigate to={firstPage?.to ?? '/settings/account'} replace />
}
