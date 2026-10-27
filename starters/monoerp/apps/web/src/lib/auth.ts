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
  const response = await fetch(CURRENT_USER_PATH, {
    credentials: 'include',
    signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
  })

  return readCurrentUser(response)
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

const CURRENT_USER_PATH = '/api/system/users/me?fields=id,email,fullName,avatarId'

// Pages outside the signed-in app, where nothing reads the session on load.
const PUBLIC_PATHS = ['/login', '/careers', '/slides']

// Runs in the page head, before the app's code has loaded, and starts the two session requests
// so they're usually done by the time the first route asks. `refreshSession` picks them up.
export const earlySessionScript = `(() => {
  if (${JSON.stringify(PUBLIC_PATHS)}.some((path) => location.pathname.startsWith(path))) return
  const init = { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' }
  const refresh = () => fetch('/api/auth/refresh', init)
  window.__sessionStart = {
    refresh: navigator.locks ? navigator.locks.request(${JSON.stringify(SESSION_REFRESH_LOCK)}, refresh) : refresh(),
    user: fetch(${JSON.stringify(CURRENT_USER_PATH)}, { credentials: 'include' }),
  }
})()`

declare global {
  interface Window {
    __sessionStart?: { refresh: Promise<Response>; user: Promise<Response> }
  }
}

// The head script's requests, once: a later refresh (after sign-in, on retry) starts fresh ones.
function takeEarlySession() {
  const early = globalThis.window?.__sessionStart

  if (early) delete window.__sessionStart

  return early
}

async function checkRefresh(response: Response) {
  if (!response.ok) {
    throw new AuthRequestError(await errorMessage(response), response.status)
  }
}

async function readCurrentUser(response: Response) {
  if (!response.ok) {
    throw new AuthRequestError(await errorMessage(response), response.status)
  }

  return currentUserResponse.parse(await response.json()).data
}

function postRefresh() {
  const request = () =>
    fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

  const locks = globalThis.navigator?.locks

  return locks ? locks.request(SESSION_REFRESH_LOCK, request) : request()
}

/** Renews the access token only, for retrying a request that came back 401. */
export async function refreshToken() {
  await checkRefresh(await postRefresh())
}

// Refreshes the session and reads the user at the same time. The read only has to wait for the
// refresh, and run again, when the access token had already expired.
export async function refreshSession() {
  const early = takeEarlySession()

  const [refreshed, user] = await Promise.allSettled([
    (early?.refresh ?? postRefresh()).then(checkRefresh),
    early?.user.then(readCurrentUser) ?? requestCurrentUser(),
  ])

  if (refreshed.status === 'rejected') throw refreshed.reason

  return user.status === 'fulfilled' ? user.value : requestCurrentUser()
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
