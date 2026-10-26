import { queryOptions, useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { UserError } from '@/lib/errors'
import { uuidSchema } from '@/lib/uuid'

export const SESSION_QUERY_KEY = ['auth', 'session'] as const

const AUTH_REQUEST_TIMEOUT_MS = 30_000

const SESSION_REFRESH_LOCK = 'monospace-session-refresh'

const authProvidersResponse = z.object({
  data: z.array(
    z.object({
      apiName: z.string(),
      protocol: z.string(),
      loginPath: z.string(),
      loginMethod: z.string(),
    }),
  ),
})

const currentUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string().nullable(),
  avatarId: z.string().nullable(),
})

const currentUserResponse = z.object({ data: currentUserSchema })

const errorBody = z.object({ message: z.string().optional() })

export type CurrentUser = z.infer<typeof currentUserSchema>

export class AuthRequestError extends UserError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }
}

async function errorMessage(response: Response) {
  const fallback = `Monospace returned ${response.status}`

  try {
    const body = errorBody.safeParse(await response.json())

    return body.data?.message ?? fallback
  } catch {
    return fallback
  }
}

async function requestCurrentUser() {
  const response = await fetch('/api/system/users/me?fields=id,email,fullName,avatarId', {
    credentials: 'include',
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new AuthRequestError(await errorMessage(response), response.status)
  }

  return currentUserResponse.parse(await response.json()).data
}

// Profile edits for the signed-in user. The generated SDK only covers the workspace scope,
// so this posts to the system route the session already reads from.
export async function updateCurrentUser(patch: {
  fullName?: string | null
  avatarId?: string | null
}) {
  const response = await fetch('/api/system/users/me?fields=id,email,fullName,avatarId', {
    method: 'PATCH',
    credentials: 'include',
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })

  if (!response.ok) {
    throw new AuthRequestError(await errorMessage(response), response.status)
  }

  return currentUserResponse.parse(await response.json()).data
}

async function requestSessionRefresh() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })

  if (!response.ok) {
    throw new AuthRequestError(await errorMessage(response), response.status)
  }

  return requestCurrentUser()
}

export function refreshSession() {
  const locks = globalThis.navigator?.locks

  return locks
    ? locks.request(SESSION_REFRESH_LOCK, requestSessionRefresh)
    : requestSessionRefresh()
}

export async function signIn(email: string, password: string) {
  const providersResponse = await fetch('/api/auth/providers', {
    credentials: 'include',
  })

  if (!providersResponse.ok) {
    throw new Error(await errorMessage(providersResponse))
  }

  const { data: providers } = authProvidersResponse.parse(await providersResponse.json())

  const provider = providers.find(
    (candidate) => candidate.protocol === 'password' && candidate.loginMethod === 'POST',
  )

  if (!provider) {
    throw new Error('No password sign-in provider is configured.')
  }

  const response = await fetch(
    `/api/auth/providers/${encodeURIComponent(provider.apiName)}${provider.loginPath}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  )

  if (!response.ok) {
    throw new Error(await errorMessage(response))
  }

  return requestCurrentUser()
}

export async function signOut() {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })

  if (!response.ok) {
    throw new Error(await errorMessage(response))
  }
}

// The signed-in user. AuthGate fetches this once per session, so children read it from cache.
export function sessionQuery() {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    queryFn: refreshSession,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function useCurrentUser() {
  return useQuery(sessionQuery()).data ?? null
}
