import { MonospaceError } from '@monospace/sdk'
import { CatchBoundary, Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

export function DataLoading({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 rounded-xl border p-4', className)} role="status">
      <span className="sr-only">{appCopy.data.loading}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function DataError({ error, className }: { error: Error; className?: string }) {
  const needsSignIn = error instanceof MonospaceError && error.status === 401
  const forbidden = error instanceof MonospaceError && error.status === 403

  return (
    <div className={cn('rounded-xl border border-destructive/30 bg-destructive/5 p-5', className)}>
      <p className="font-medium">
        {needsSignIn
          ? appCopy.data.sessionExpiredTitle
          : forbidden
            ? appCopy.data.forbiddenTitle
            : appCopy.data.loadFailedTitle}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {needsSignIn
          ? appCopy.data.sessionExpiredDescription
          : forbidden
            ? appCopy.data.forbiddenDescription
            : errorMessage(error, appCopy.data.loadFailedDescription)}
      </p>
      {needsSignIn ? (
        <Link to="/login" className={buttonVariants({ size: 'sm', className: 'mt-4' })}>
          {appCopy.auth.signIn}
        </Link>
      ) : null}
    </div>
  )
}

// Every route's error boundary (the router's `defaultErrorComponent`). Without one, TanStack only
// catches at the root, so any failed loader or render replaced the whole app, sidebar included.
// Retrying reruns the loaders.
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="space-y-3">
      <DataError error={error} />
      <Button type="button" variant="outline" size="sm" onClick={() => void router.invalidate()}>
        {appCopy.auth.tryAgain}
      </Button>
    </div>
  )
}

// Keeps a crash in one part of a page, such as a panel of portal or Stripe data, to that part.
export function SectionBoundary({ resetKey, children }: { resetKey: string; children: ReactNode }) {
  return (
    <CatchBoundary getResetKey={() => resetKey} errorComponent={SectionError}>
      {children}
    </CatchBoundary>
  )
}

function SectionError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="space-y-3">
      <DataError error={error} />
      <Button type="button" variant="outline" size="sm" onClick={reset}>
        {appCopy.auth.tryAgain}
      </Button>
    </div>
  )
}
