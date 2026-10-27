import { noop } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AuthRequestError, sessionQuery } from '@/lib/auth'
import { loadMembers } from '@/lib/monospace-system'
import { userPoliciesQuery } from '@/lib/permissions'
import { AppShell } from '@/shell/app-shell'
import { AuthGate } from '@/shell/auth-gate'

export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: async ({ context: { queryClient }, location }) => {
    try {
      const user = await queryClient.query({ ...sessionQuery(), staleTime: 'static' })

      // Every page needs these, so start them now, alongside the page's own loader, not after it.
      void queryClient.query(userPoliciesQuery(user.id)).catch(noop)
      void loadMembers()
    } catch (error) {
      if (error instanceof AuthRequestError && error.status === 401) {
        throw redirect({
          to: '/login',
          search: { redirect: location.href },
        })
      }

      throw error
    }
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
  )
}
