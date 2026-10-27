import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { appCopy } from '@/lib/app.copy'
import { AuthRequestError, sessionQuery } from '@/lib/auth'

export function AuthGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const redirectStarted = useRef(false)
  const session = useQuery(sessionQuery())

  const signedOut =
    session.isError && session.error instanceof AuthRequestError && session.error.status === 401

  useEffect(() => {
    if (!signedOut || redirectStarted.current) return

    redirectStarted.current = true
    const search = new URLSearchParams({ redirect: location.href })
    window.location.replace(`/login?${search}`)
  }, [location.href, signedOut])

  if (session.isPending || signedOut) {
    return <AuthPageState message={signedOut ? appCopy.auth.redirecting : appCopy.auth.signingIn} />
  }

  if (session.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{appCopy.auth.unavailableTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">{appCopy.auth.unavailableDescription}</p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => session.refetch()}>
              {appCopy.auth.tryAgain}
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return children
}

function AuthPageState({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
          M
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  )
}
