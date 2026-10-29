import { InvalidConfiguration } from '@monospace/extension-kit/data-connector'

export const STRIPE_API_BASE = 'https://api.stripe.com'

export interface StripeConfig {
  readonly apiKey: string
  /** Stripe itself unless set, for example to a local Stripe emulator. */
  readonly apiBase: URL
  /** Writes default to on for test-mode keys and off for live-mode keys. */
  readonly enableWrites: boolean
  /** Upper bound on items one query may fetch from Stripe before it is refused. */
  readonly maxItemsPerQuery: number
}

const DEFAULT_MAX_ITEMS_PER_QUERY = 5000

// Studio's form for an extension is one JSON box, so errors show what to paste into it.
const EXAMPLE =
  '{ "apiKey": "sk_test_monoerp", "apiBase": "http://stripe:4010" } for the local Stripe, or { "apiKey": "sk_test_…" } with your own key for Stripe itself'

export function parseConfig(value: unknown): StripeConfig {
  if (!isObject(value)) {
    throw new InvalidConfiguration(
      `Stripe configuration must be a JSON object, for example ${EXAMPLE}.`,
    )
  }

  const apiKey = value.apiKey

  if (typeof apiKey !== 'string' || !/^(?:sk|rk)_(?:test|live)_\w+$/u.test(apiKey)) {
    throw new InvalidConfiguration(
      `Stripe configuration \`apiKey\` must be a secret (\`sk_\`) or restricted (\`rk_\`) key, for example ${EXAMPLE}.`,
    )
  }

  const apiBase = parseApiBase(value.apiBase ?? STRIPE_API_BASE)
  const isTestKey = apiKey.includes('_test_')
  const enableWrites = value.enableWrites ?? isTestKey

  if (typeof enableWrites !== 'boolean') {
    throw new InvalidConfiguration('Stripe configuration `enableWrites` must be a boolean.')
  }

  const maxItemsPerQuery = value.maxItemsPerQuery ?? DEFAULT_MAX_ITEMS_PER_QUERY

  if (
    typeof maxItemsPerQuery !== 'number' ||
    !Number.isSafeInteger(maxItemsPerQuery) ||
    maxItemsPerQuery < 1
  ) {
    throw new InvalidConfiguration(
      'Stripe configuration `maxItemsPerQuery` must be a positive integer.',
    )
  }

  return { apiKey, apiBase, enableWrites, maxItemsPerQuery }
}

/** The `net:` permission for a host other than Stripe's, which the manifest already declares. */
export function apiBasePermission(apiBase: URL): `net:${string}` | undefined {
  if (apiBase.origin === STRIPE_API_BASE) return undefined
  const port = apiBase.port || (apiBase.protocol === 'https:' ? '443' : '80')

  return `net:${apiBase.hostname}:${port}`
}

function parseApiBase(value: unknown): URL {
  const url = typeof value === 'string' && URL.canParse(value) ? new URL(value) : undefined

  if (
    url === undefined ||
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.pathname !== '/'
  ) {
    throw new InvalidConfiguration(
      'Stripe configuration `apiBase` must be an http(s) origin, such as `https://api.stripe.com`.',
    )
  }

  return url
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
