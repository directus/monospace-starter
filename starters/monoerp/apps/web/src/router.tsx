import { MonospaceError } from '@monospace/sdk'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'

import { RouteError } from '@/components/data-state'
import { AuthRequestError } from '@/lib/auth'
import { reportUnexpectedError } from '@/lib/errors'

import { routeTree } from './routeTree.gen'

// A 4xx fails the same way on retry, so only retry network and server errors.
function isClientError(error: Error) {
  return (
    (error instanceof MonospaceError || error instanceof AuthRequestError) &&
    error.status >= 400 &&
    error.status < 500
  )
}

export function getRouter() {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: reportUnexpectedError }),
    mutationCache: new MutationCache({ onError: reportUnexpectedError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < 1 && !isClientError(error),
      },
    },
  })

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
