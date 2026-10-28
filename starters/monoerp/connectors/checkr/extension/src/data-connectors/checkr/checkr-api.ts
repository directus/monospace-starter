import {
  AccessDenied,
  ConnectionFailed,
  QueryRejected,
  RateLimited,
} from '@monospace/extension-kit/data-connector'

export const HOSTS = {
  production: 'api.checkr.com',
  staging: 'api.checkr-staging.com',
} as const

export type Environment = keyof typeof HOSTS

/** Checkr's largest page. */
export const PAGE_SIZE = 100

/** The envelope every Checkr list answers with. */
interface ListResponse<T> {
  data?: T[]
  count?: number
  next_href?: string | null
}

export type Params = Record<string, string | number | undefined>

export class CheckrClient {
  private readonly base: URL
  private readonly authorization: string

  constructor(apiKey: string, environment: Environment, apiBase?: URL) {
    this.base = new URL('/v1/', apiBase ?? `https://${HOSTS[environment]}`)
    // Basic auth with the key as the user name and an empty password.
    this.authorization = `Basic ${btoa(`${apiKey}:`)}`
  }

  /** GETs `path`, answering `null` when Checkr reports it does not exist. */
  async get<T>(path: string, params: Params = {}): Promise<T | null> {
    const url = new URL(path, this.base)

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const response = await fetch(url, {
      headers: { Authorization: this.authorization, Accept: 'application/json' },
    }).catch((error: unknown) => {
      throw new ConnectionFailed('The Checkr API could not be reached.', { cause: error })
    })

    if (response.status === 404) return null

    if (response.status === 401) throw new AccessDenied('Checkr rejected the API key.')

    if (response.status === 403)
      throw new AccessDenied('The Checkr API key is not allowed to read this resource.')

    if (response.status === 429) {
      const reset = response.headers.get('x-ratelimit-reset')
      throw new RateLimited(`Checkr is rate limiting requests${reset ? ` until ${reset}` : ''}.`)
    }

    if (response.status === 400) {
      throw new QueryRejected(`Checkr rejected the request: ${await errorMessage(response)}`)
    }

    if (!response.ok) throw new ConnectionFailed(`Checkr answered HTTP ${response.status}.`)

    return response.json().catch((error: unknown) => {
      throw new ConnectionFailed('Checkr answered with a body that is not JSON.', { cause: error })
    }) as Promise<T>
  }

  async list<T>(
    path: string,
    params: Params,
    page: number,
    perPage = PAGE_SIZE,
  ): Promise<{ data: T[]; count?: number; more: boolean }> {
    const body = await this.get<ListResponse<T>>(path, { ...params, page, per_page: perPage })

    if (!body || !Array.isArray(body.data))
      throw new ConnectionFailed(`Checkr answered ${path} without a data list.`)

    return {
      data: body.data,
      count: body.count,
      more: Boolean(body.next_href) && body.data.length > 0,
    }
  }

  /** Yields every item of a list, starting at the zero-based `from`. */
  async *paginate<T>(path: string, params: Params = {}, from = 0): AsyncGenerator<T> {
    let page = Math.floor(from / PAGE_SIZE) + 1
    let skip = from % PAGE_SIZE

    while (true) {
      const { data, more } = await this.list<T>(path, params, page)
      yield* data.slice(skip)

      if (!more) return
      skip = 0
      page++
    }
  }
}

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null

  return typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`
}
