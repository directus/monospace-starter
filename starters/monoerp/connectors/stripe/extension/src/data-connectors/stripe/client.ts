import {
  AccessDenied,
  ConnectionFailed,
  NullConstraintViolation,
  QueryRejected,
  RateLimited,
  UniqueConstraintViolation,
} from '@monospace/extension-kit/data-connector'
import { STRIPE_API_VERSION } from './collections'

const PAGE_SIZE = 100

export type StripeObject = Record<string, unknown> & { id: string }

interface StripeList {
  data: StripeObject[]
  has_more: boolean
}

interface StripeErrorBody {
  error?: { code?: string; message?: string; type?: string }
}

/**
 * Stripe has no object with the requested id. Reads treat it as no match; the kit has no error for
 * it, so anywhere else it reaches Engine as a rejected query.
 */
export class StripeResourceMissing extends QueryRejected {}

/** A Stripe error the connector has no better class for; kept so callers can inspect it. */
export class StripeRequestFailed extends ConnectionFailed {
  constructor(
    message: string,
    readonly status: number,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

export class StripeClient {
  readonly #apiKey: string
  readonly #baseUrl: URL

  constructor(apiKey: string, apiBase: URL) {
    this.#apiKey = apiKey
    this.#baseUrl = new URL('/v1/', apiBase)
  }

  /**
   * Pages through a list, newest first, skipping the first `offset` objects. Stripe documents only
   * cursors, so an offset costs one request per hundred skipped objects.
   */
  async *list(
    path: string,
    parameters: Readonly<Record<string, string>>,
    offset = 0,
  ): AsyncGenerator<StripeObject> {
    let startingAfter: string | undefined
    let skip = offset

    for (;;) {
      const query = new URLSearchParams({ ...parameters, limit: String(PAGE_SIZE) })

      if (startingAfter !== undefined) query.set('starting_after', startingAfter)

      const page = await this.request<StripeList>('GET', `${path}?${query}`)
      const skipped = Math.min(skip, page.data.length)
      skip -= skipped
      yield* page.data.slice(skipped)

      const last = page.data.at(-1)

      if (!page.has_more || last === undefined) return
      startingAfter = last.id
    }
  }

  /** One cheap authenticated read, to prove the key works. */
  async ping(): Promise<void> {
    await this.request<StripeList>('GET', 'customers?limit=1')
  }

  /** `undefined` when the object does not exist or was deleted. */
  async retrieve(path: string, id: string): Promise<StripeObject | undefined> {
    try {
      const object = await this.request<StripeObject>('GET', `${path}/${encodeURIComponent(id)}`)

      // Deleted customers and products are still retrievable, as tombstones.
      return object.deleted === true ? undefined : object
    } catch (error) {
      if (error instanceof StripeResourceMissing) return undefined
      throw error
    }
  }

  async post(path: string, form: URLSearchParams): Promise<StripeObject> {
    return await this.request<StripeObject>('POST', path, form)
  }

  async delete(path: string, id: string): Promise<void> {
    await this.request<StripeObject>('DELETE', `${path}/${encodeURIComponent(id)}`)
  }

  private async request<T>(method: string, path: string, form?: URLSearchParams): Promise<T> {
    let response: Response

    try {
      response = await fetch(new URL(path, this.#baseUrl), {
        method,
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Stripe-Version': STRIPE_API_VERSION,
          ...(form === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        ...(form === undefined ? {} : { body: form.toString() }),
      })
    } catch (error) {
      // Keep the rejection as the cause: Engine finds a permission denial there.
      throw new ConnectionFailed('Could not reach the Stripe API.', { cause: error })
    }

    if (response.status === 429)
      throw new RateLimited('Stripe rate limited the connector. Try again shortly.')

    const body = await response.text()
    let parsed: unknown

    try {
      parsed = JSON.parse(body)
    } catch (error) {
      throw new StripeRequestFailed(
        `Stripe returned invalid JSON for ${method} ${path}.`,
        response.status,
        { cause: error },
      )
    }

    if (!response.ok)
      throw toConnectorError(response.status, parsed as StripeErrorBody, `${method} ${path}`)

    return parsed as T
  }
}

function toConnectorError(status: number, body: StripeErrorBody, request: string): Error {
  const message = body.error?.message ?? `Stripe request failed: ${request}`

  if (status === 401 || status === 403)
    return new AccessDenied(`Stripe refused the API key: ${message}`)

  switch (body.error?.code) {
    case 'resource_missing':
      return new StripeResourceMissing(message)
    case 'resource_already_exists':
      return new UniqueConstraintViolation(message)
    case 'parameter_missing':
      return new NullConstraintViolation(message)
    default:
      return status === 400 ? new QueryRejected(message) : new StripeRequestFailed(message, status)
  }
}
