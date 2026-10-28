// A local Checkr for the stack, read-only like the connector in connectors/checkr. It answers the
// few v1 endpoints the connector calls, with the records in seed.json: background checks for ATS
// candidates at the Background Check and Offer stages, plus a few hires. Any API key works.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 4020)

const seed = JSON.parse(readFileSync(new URL('seed.json', import.meta.url), 'utf8'))

const candidates = seed.candidates.map(({ reports, invitations: _invitations, ...candidate }) => ({
  object: 'candidate',
  middle_name: null,
  phone: null,
  zipcode: null,
  dob: null,
  adjudication: null,
  geo_ids: [],
  metadata: {},
  ...candidate,
  report_ids: reports.map((report) => report.id),
}))

const reports = seed.candidates.flatMap((candidate) =>
  candidate.reports.map((report) => ({
    object: 'report',
    candidate_id: candidate.id,
    result: null,
    adjudication: null,
    assessment: null,
    includes_canceled: false,
    archived: false,
    turnaround_time: null,
    completed_at: null,
    revised_at: null,
    upgraded_at: null,
    estimated_completion_time: null,
    ...report,
  })),
)

const invitations = seed.candidates.flatMap((candidate) =>
  candidate.invitations.map((invitation) => ({
    object: 'invitation',
    candidate_id: candidate.id,
    report_id: null,
    invitation_url: `https://apply.checkr-staging.com/invite/${invitation.id}`,
    archived: false,
    completed_at: null,
    deleted_at: null,
    ...invitation,
  })),
)

const packages = seed.packages.map((pack) => ({
  object: 'package',
  apply_url: `https://apply.checkr-staging.com/apply/directus/${pack.slug}`,
  deleted_at: null,
  ...pack,
}))

// Checkr lists newest first.
const newestFirst = (records) =>
  records.toSorted((a, b) => b.created_at.localeCompare(a.created_at))

const collections = {
  candidates: {
    records: newestFirst(candidates),
    filter: (record, query) =>
      matches(record.email, query.get('email')) &&
      matches(record.custom_id, query.get('custom_id')) &&
      matches(record.adjudication, query.get('adjudication')) &&
      (!query.get('created_after') || record.created_at > query.get('created_after')) &&
      (!query.get('created_before') || record.created_at < query.get('created_before')),
  },
  invitations: {
    records: newestFirst(invitations),
    filter: (record, query) =>
      matches(record.candidate_id, query.get('candidate_id')) &&
      matches(record.status, query.get('status')),
  },
  packages: { records: newestFirst(packages), filter: () => true },
  // Checkr has no list of reports, only GET /v1/reports/:id.
  reports: { records: reports },
}

function matches(value, wanted) {
  return wanted === null || wanted === '' || value === wanted
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function list(collection, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? 25)))

  const matching = collection.records.filter((record) =>
    collection.filter(record, url.searchParams),
  )

  const data = matching.slice((page - 1) * perPage, page * perPage)

  const href = (to) => {
    const next = new URL(url)
    next.searchParams.set('page', String(to))

    return next.href
  }

  return {
    object: 'list',
    data,
    count: matching.length,
    next_href: page * perPage < matching.length ? href(page + 1) : null,
    previous_href: page > 1 ? href(page - 1) : null,
  }
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`)
  const [, version, path, id, extra] = url.pathname.split('/')

  if (url.pathname === '/health') return send(response, 200, { ok: true })

  if (request.method !== 'GET') return send(response, 405, { error: 'This Checkr is read-only' })

  // Checkr uses basic auth with the key as the user name. Any key is accepted here.
  if (!request.headers.authorization?.startsWith('Basic ')) {
    return send(response, 401, { error: 'Bad authentication error' })
  }

  if (version !== 'v1' || extra !== undefined) return send(response, 404, { error: 'Not found' })

  if (path === 'account' && id === undefined) {
    return send(response, 200, { id: 'acct_directus', object: 'account', name: 'Directus' })
  }

  const collection = collections[path]

  if (!collection) return send(response, 404, { error: 'Not found' })

  if (id !== undefined) {
    const record = collection.records.find((candidate) => candidate.id === decodeURIComponent(id))

    return record ? send(response, 200, record) : send(response, 404, { error: 'Not found' })
  }

  if (!collection.filter) return send(response, 404, { error: 'Not found' })

  send(response, 200, list(collection, url))
}).listen(port, () => console.log(`Checkr emulator on :${port}`))
