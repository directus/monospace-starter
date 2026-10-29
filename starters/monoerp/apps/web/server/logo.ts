import { defineHandler, getRouterParam } from 'nitro/h3'

// Serves an organization logo for a domain from logo.dev. Misses are a 404 (`fallback=404`
// suppresses logo.dev's monogram placeholder) so the client can show its own icon. Responses are
// cached for a day so lists stay cheap.
//
// This is a nitro route rather than a TanStack Start server route on purpose: nitro's dev server
// treats requests with `sec-fetch-dest: image` as static assets and only hands them to an app
// handler when a specific nitro route matches, so browser <img> loads never reached the file route.
const DOMAIN = /^(?!-)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}$/i

// Process-local cache so a page of 50 organizations doesn't fan out to logo.dev on every load.
// Hits live a day, misses an hour, and the map is capped so an unbounded set of domains can't grow it.
const HIT_TTL = 86_400_000

const MISS_TTL = 3_600_000

const MAX_ENTRIES = 2_000

type Cached = { body: ArrayBuffer; type: string } | null

const cache = new Map<string, { value: Cached; expires: number }>()

function remember(domain: string, value: Cached) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value

    if (oldest) cache.delete(oldest)
  }

  cache.set(domain, { value, expires: Date.now() + (value ? HIT_TTL : MISS_TTL) })

  return value
}

function respond(value: Cached) {
  if (!value) return new Response(null, { status: 404 })

  return new Response(value.body, {
    headers: {
      'content-type': value.type,
      'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  })
}

async function fetchImage(url: string): Promise<Cached> {
  try {
    // logo.dev answers directly, so a redirect is refused rather than followed somewhere unchecked.
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(4_000) })
    const type = response.headers.get('content-type') ?? ''

    if (!response.ok || !type.startsWith('image/')) return null

    return { body: await response.arrayBuffer(), type }
  } catch {
    return null
  }
}

export default defineHandler(async (event) => {
  const domain = (getRouterParam(event, 'domain') ?? '').trim().toLowerCase()

  if (!DOMAIN.test(domain)) return new Response(null, { status: 400 })

  const hit = cache.get(domain)

  if (hit && hit.expires > Date.now()) return respond(hit.value)

  const token = process.env.LOGO_DEV_TOKEN

  if (!token) return respond(null)

  const image = await fetchImage(
    `https://img.logo.dev/${domain}?token=${token}&size=128&format=png&fallback=404`,
  )

  return respond(remember(domain, image))
})
