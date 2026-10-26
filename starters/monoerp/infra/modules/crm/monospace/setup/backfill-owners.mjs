// Gives every unowned interaction an owner so "Mine" on the activity page has something to
// show. Uses the workspace users in round-robin; run after the seed and setup:monospace.
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile('.env')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const port = process.env.MONOSPACE_PORT ?? '8100'

const baseUrl = process.env.MONOSPACE_URL ?? `http://127.0.0.1:${port}`

const workspace = process.env.MONOSPACE_WORKSPACE ?? 'crm'

const apiUrl = `${baseUrl.replace(/\/$/, '')}/api`

let cookie = ''

async function request(path, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')

  if (init.body) headers.set('content-type', 'application/json')

  if (cookie) headers.set('cookie', cookie)

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers })
  const setCookies = response.headers.getSetCookie()

  if (setCookies.length > 0) {
    cookie = setCookies.map((value) => value.split(';', 1)[0]).join('; ')
  }

  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} returned ${response.status}: ${await response.text()}`,
    )
  }

  const body = await response.text()

  return body ? JSON.parse(body) : null
}

async function authenticate() {
  const { data: providers } = await request('/auth/providers')

  const provider = providers.find(
    (candidate) => candidate.protocol === 'password' && candidate.loginMethod === 'POST',
  )

  if (!provider) throw new Error('No password authentication provider is available')
  await request(`/auth/providers/${provider.apiName}${provider.loginPath}`, {
    method: 'POST',
    body: JSON.stringify({
      email: process.env.MONOSPACE_ADMIN_EMAIL ?? 'admin@example.com',
      password: process.env.MONOSPACE_ADMIN_PASSWORD ?? 'monospace',
    }),
  })
}

await authenticate()

const items = (collection) => `/${encodeURIComponent(workspace)}/items/${collection}`

const { data: users } = await request(
  `/${encodeURIComponent(workspace)}/members?fields=id,email&limit=100`,
)

if (!users.length) throw new Error('No users in the workspace')

const { data: unowned } = await request(
  `${items('interactions')}?fields=id&filter[ownerUserId][_null]=true&limit=5000`,
)

let index = 0

for (const row of unowned) {
  const owner = users[index++ % users.length]
  await request(`${items('interactions')}/${row.id}?fields=id`, {
    method: 'PATCH',
    body: JSON.stringify({ ownerUserId: owner.id }),
  })
}

console.log(
  `Assigned ${unowned.length} interaction${unowned.length === 1 ? '' : 's'} across ${users.length} user${users.length === 1 ? '' : 's'}.`,
)
