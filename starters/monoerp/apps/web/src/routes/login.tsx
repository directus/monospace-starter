import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SESSION_QUERY_KEY, signIn } from '@/lib/auth'
import { appCopy } from '@/lib/app.copy'

const credentials = z.object({ email: z.string(), password: z.string() })

const loginSearchSchema = z.object({
  redirect: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})

function LoginPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const queryClient = useQueryClient()

  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),
    onSuccess: async (user) => {
      queryClient.clear()
      queryClient.setQueryData(SESSION_QUERY_KEY, user)

      if (search.redirect?.startsWith('/') && !search.redirect.startsWith('//')) {
        window.location.assign(search.redirect)

        return
      }

      await navigate({ to: '/' })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = credentials.safeParse(Object.fromEntries(new FormData(event.currentTarget)))

    if (!form.success) return

    login.mutate(form.data)
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
            M
          </div>
          <CardTitle>{appCopy.auth.signInTitle}</CardTitle>
          <p className="text-sm text-muted-foreground">{appCopy.auth.signInDescription}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">{appCopy.auth.email}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={import.meta.env.DEV ? 'admin@example.com' : undefined}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{appCopy.auth.password}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                defaultValue={import.meta.env.DEV ? 'monospace' : undefined}
                required
              />
            </div>
            {login.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {login.error.message}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? appCopy.auth.signingIn : appCopy.auth.continue}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
