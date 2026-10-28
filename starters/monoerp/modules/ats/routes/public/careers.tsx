import { Outlet, createFileRoute } from '@tanstack/react-router'

import { atsCopy } from '@/modules/ats/ats.copy'
import { CareersShell } from '@/modules/ats/components/careers/careers-shell'

const copy = atsCopy.careers

// The public careers site. It sits outside `_app`, so there's no app shell and no sign-in:
// signed-out visitors read through Monospace's public role (modules/ats/data/careers.ts).
export const Route = createFileRoute('/careers')({
  // The client talks to Monospace by relative URL, which only resolves in the browser.
  ssr: false,
  head: () => ({
    meta: [{ title: copy.pageTitle }, { name: 'description', content: copy.metaDescription }],
  }),
  component: CareersLayout,
})

function CareersLayout() {
  return (
    <CareersShell>
      <Outlet />
    </CareersShell>
  )
}
