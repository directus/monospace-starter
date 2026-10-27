import { mapEngineError, MonospaceError } from '@monospace/sdk'
import type { ClientConfig } from '@monospace/sdk'
import { ofetch } from 'ofetch'
import { z } from 'zod'

import { AuthRequestError, refreshSession } from './auth'

// The error body Monospace sends with a failed request; `source` nests the underlying cause.
const engineError = z.object({
  message: z.string(),
  get source() {
    return engineError.optional()
  },
  meta: z.record(z.string(), z.json()).optional(),
})

type HttpFactory = NonNullable<ClientConfig['http']>

let refreshPromise: Promise<void> | undefined

let sessionGeneration = 0

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshSession()
      .then(() => {
        sessionGeneration += 1
      })
      .finally(() => {
        refreshPromise = undefined
      })
  }

  return refreshPromise
}

async function withSessionRefresh<T>(request: () => Promise<T>, refreshEnabled: boolean) {
  const requestGeneration = sessionGeneration

  try {
    return await request()
  } catch (error) {
    if (!(error instanceof MonospaceError) || error.status !== 401 || !refreshEnabled) throw error

    if (requestGeneration === sessionGeneration) {
      try {
        await refreshAccessToken()
      } catch (refreshError) {
        if (refreshError instanceof AuthRequestError && refreshError.status === 401) throw error
        throw refreshError
      }
    }

    return request()
  }
}

export const authenticatedHttp: HttpFactory = (config) => {
  const client = ofetch.create({
    baseURL: `${config.url}/api/${config.workspace}`,
    credentials: config.credentials,
    retry: 1,
    timeout: 30_000,
    onResponseError({ response }) {
      const error = engineError.safeParse(response._data)

      if (error.success) throw mapEngineError(error.data, response.status)
      const text = z.string().safeParse(response._data)

      if (text.success) throw mapEngineError({ message: text.data }, response.status)

      throw mapEngineError({ message: 'Request failed' }, response.status)
    },
  })

  return {
    request: ({ method, path, query, body, headers }) =>
      withSessionRefresh(
        () => client(path, { method, query, body, headers }),
        typeof window !== 'undefined',
      ),
  }
}
