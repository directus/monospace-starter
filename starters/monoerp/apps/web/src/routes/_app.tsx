import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AuthRequestError, refreshSession, SESSION_QUERY_KEY } from '@/lib/auth'
import { AppShell } from '@/shell/app-shell'
import { AuthGate } from '@/shell/auth-gate'

export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: async ({ context: { queryClient }, location }) => {
    try {
      await queryClient.ensureQueryData({
        queryKey: SESSION_QUERY_KEY,
        queryFn: refreshSession,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      })
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
