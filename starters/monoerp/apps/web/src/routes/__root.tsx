import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import {
  type ErrorComponentProps,
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { appCopy } from '@/lib/app.copy'
import { earlySessionScript } from '@/lib/auth'
import { reportUnexpectedError } from '@/lib/errors'
import { appStorageKey } from '@/lib/storage'

import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, interactive-widget=resizes-content',
      },
      {
        title: appCopy.app.name,
      },
      {
        name: 'description',
        content: appCopy.app.description,
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">{appCopy.notFound.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{appCopy.notFound.title}</h1>
        <p className="text-sm text-muted-foreground">{appCopy.notFound.description}</p>
        <Link to="/" className={buttonVariants()}>
          {appCopy.notFound.action}
        </Link>
      </div>
    </main>
  )
}

function ErrorPage({ error }: ErrorComponentProps) {
  useEffect(() => reportUnexpectedError(error), [error])

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{appCopy.error.title}</h1>
        <p className="text-sm text-muted-foreground">{appCopy.error.description}</p>
        <button type="button" className={buttonVariants()} onClick={() => window.location.reload()}>
          {appCopy.error.action}
        </button>
      </div>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Before the app's code loads, so the session is ready when the first route needs it. */}
        <script dangerouslySetInnerHTML={{ __html: earlySessionScript }} />
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.toggle('dark', localStorage.getItem(${JSON.stringify(appStorageKey('theme'))}) === 'dark' || (!localStorage.getItem(${JSON.stringify(appStorageKey('theme'))}) && matchMedia('(prefers-color-scheme: dark)').matches))`,
          }}
        />
      </head>
      <body>
        {children}
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'TanStack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
