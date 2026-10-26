import { defineHandler, proxyRequest } from 'nitro/h3'

// Proxies Monospace asset downloads (avatars and CRM attachments). The `/api/**` dev proxy would cover this, except
// nitro's dev server treats requests with `sec-fetch-dest: image` as static assets and only
// hands them to an app handler when a specific nitro route matches (see logo.ts). In production
// Caddy proxies `/api/*` before the app sees it, so this route only ever runs in dev.
const target =
  process.env.MONOSPACE_PROXY_TARGET ?? `http://localhost:${process.env.MONOSPACE_PORT ?? '8100'}`

export default defineHandler((event) =>
  proxyRequest(event, `${target}${event.url.pathname}${event.url.search}`),
)
