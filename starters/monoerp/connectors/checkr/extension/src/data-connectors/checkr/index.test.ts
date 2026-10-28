import type { OperationSerialized } from '@monospace/extension-kit/data-connector'
import {
  AccessDenied,
  InvalidConfiguration,
  QueryRejected,
  RateLimited,
} from '@monospace/extension-kit/data-connector'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import connector from './index'

type Handler = (params: URLSearchParams, id: string | undefined) => unknown

let routes: Record<string, Handler>

let calls: URL[]

beforeEach(() => {
  routes = {}
  calls = []
  vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
    expect(new Headers(init.headers).get('authorization')).toBe(`Basic ${btoa('sk_test:')}`)
    calls.push(input)
    const [, version, path, id] = input.pathname.split('/')
    expect(version).toBe('v1')
    const route = routes[path!]
    const body = route ? route(input.searchParams, id) : null

    if (body instanceof Response) return body

    return body === null
      ? Response.json({ error: 'Not found' }, { status: 404 })
      : Response.json(body)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function handlers(config: Record<string, unknown> = {}) {
  return connector.setup({ config: { apiKey: 'sk_test', ...config } })
}

async function query(op: OperationSerialized, config?: Record<string, unknown>) {
  return (await handlers(config)).query({ query: op })
}

const candidate = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  object: 'candidate',
  first_name: `First ${id}`,
  last_name: 'Doe',
  email: `${id}@example.com`,
  phone: null,
  dob: '1990-05-01',
  ssn: 'XXX-XX-4645',
  driver_license_number: 'F1112001',
  report_ids: [],
  geo_ids: [],
  created_at: '2024-01-01T10:00:00Z',
  ...extra,
})

/** Serves `records` as a Checkr list, honouring page and per_page. */
function list(records: unknown[]): Handler {
  return (params, id) => {
    if (id !== undefined)
      return records.find((record) => (record as { id: string }).id === id) ?? null
    const page = Number(params.get('page'))
    const perPage = Number(params.get('per_page'))
    const data = records.slice((page - 1) * perPage, page * perPage)

    return {
      object: 'list',
      data,
      count: records.length,
      next_href: page * perPage < records.length ? 'https://next' : null,
    }
  }
}

const page = (url: URL) => `${url.searchParams.get('page')}/${url.searchParams.get('per_page')}`

describe('configuration', () => {
  it('rejects a missing key or unknown environment', () => {
    expect(() => connector.setup({ config: {} })).toThrow(InvalidConfiguration)
    expect(() => handlers({ environment: 'sandbox' })).toThrow(InvalidConfiguration)
  })

  it('asks for the host of its environment', () => {
    expect(connector.preflight?.({ config: { apiKey: 'sk_test' } })).toMatchObject({
      permissions: [{ permission: 'net:api.checkr.com' }],
    })
    expect(
      connector.preflight?.({ config: { apiKey: 'sk_test', environment: 'staging' } }),
    ).toMatchObject({ permissions: [{ permission: 'net:api.checkr-staging.com' }] })
  })

  it('calls the staging host', async () => {
    routes.packages = list([])
    await query(
      { op: 'readMany', collection: 'packages', select: ['id'] },
      { environment: 'staging' },
    )
    expect(calls[0]?.host).toBe('api.checkr-staging.com')
  })

  it('calls and asks for an apiBase override instead', async () => {
    const config = { apiKey: 'sk_test', apiBase: 'http://checkr:4020' }
    expect(connector.preflight?.({ config })).toMatchObject({
      permissions: [{ permission: 'net:checkr:4020' }],
    })
    routes.packages = list([])
    await query({ op: 'readMany', collection: 'packages', select: ['id'] }, config)
    expect(calls[0]?.href).toBe('http://checkr:4020/v1/packages?page=1&per_page=100')
    expect(() => handlers({ apiBase: 'checkr:4020/api' })).toThrow(InvalidConfiguration)
  })

  it('declares every collection', async () => {
    expect(JSON.stringify(await (await handlers()).introspect())).toContain('"invitations"')
  })
})

describe('candidates', () => {
  it('maps fields and leaves out SSNs and license numbers', async () => {
    routes.candidates = list([candidate('c1', { metadata: { team: 'ops' } })])

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      select: ['id', 'email', 'phone', 'dob', 'metadata', 'created_at'],
    })

    expect(result).toEqual({
      records: [
        {
          id: 'c1',
          email: 'c1@example.com',
          phone: null,
          dob: '1990-05-01',
          metadata: { team: 'ops' },
          created_at: '2024-01-01T10:00:00.000Z',
        },
      ],
    })
    expect(
      JSON.stringify(
        await query({
          op: 'readOne',
          collection: 'candidates',
          key: { id: 'c1' },
          select: ['id', 'first_name'],
        }),
      ),
    ).not.toMatch(/4645|F1112001/)
  })

  it('pages straight to the offset when there is no filter', async () => {
    routes.candidates = list(Array.from({ length: 250 }, (_, index) => candidate(`c${index}`)))

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      select: ['id'],
      offset: 205,
      limit: 2,
    })

    expect(result).toEqual({ records: [{ id: 'c205' }, { id: 'c206' }] })
    expect(calls.map(page)).toEqual(['3/100'])
  })

  it('crosses pages and stops once the page is full', async () => {
    routes.candidates = list(Array.from({ length: 250 }, (_, index) => candidate(`c${index}`)))

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      select: ['id'],
      offset: 99,
      limit: 2,
    })

    expect(result).toEqual({ records: [{ id: 'c99' }, { id: 'c100' }] })
    expect(calls.map(page)).toEqual(['1/100', '2/100'])
  })

  it('sends equality and date filters to Checkr and still applies the whole filter', async () => {
    routes.candidates = list([
      candidate('c1'),
      candidate('c2', { created_at: '2023-01-01T00:00:00Z' }),
    ])

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      select: ['id'],
      filter: {
        and: [
          { cmp: 'equals', left: { field: 'email' }, right: { value: 'c1@example.com' } },
          {
            cmp: 'greaterThanOrEquals',
            left: { field: 'created_at' },
            right: { value: '2024-01-01T10:00:00Z' },
          },
        ],
      },
    })

    expect(result).toEqual({ records: [{ id: 'c1' }] })
    expect(calls[0]?.searchParams.get('email')).toBe('c1@example.com')
    expect(calls[0]?.searchParams.get('created_after')).toBe('2024-01-01T09:59:59.000Z')
    expect(calls[0]?.searchParams.has('created_before')).toBe(false)
  })

  it('counts with one request when there is no filter', async () => {
    routes.candidates = list(Array.from({ length: 250 }, (_, index) => candidate(`c${index}`)))

    expect(
      await query({ op: 'readMany', collection: 'candidates', count: true, limit: 0 }),
    ).toEqual({ totalCount: 250 })
    expect(calls.map(page)).toEqual(['1/1'])
  })

  it('counts filtered candidates across pages', async () => {
    routes.candidates = list(
      Array.from({ length: 250 }, (_, index) =>
        candidate(`c${index}`, { last_name: index % 2 ? 'Odd' : 'Even' }),
      ),
    )

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      count: true,
      limit: 0,
      filter: { cmp: 'equals', left: { field: 'last_name' }, right: { value: 'Odd' } },
    })

    expect(result).toEqual({ totalCount: 125 })
  })

  it('looks a few ids up directly, as relation reads ask', async () => {
    routes.candidates = list([candidate('c1'), candidate('c2')])

    const result = await query({
      op: 'readMany',
      collection: 'candidates',
      select: ['id'],
      filter: { and: [{ in: { field: 'id' }, values: ['c2', 'missing'] }] },
    })

    expect(result).toEqual({ records: [{ id: 'c2' }] })
    expect(calls.map((url) => url.pathname)).toEqual([
      '/v1/candidates/c2',
      '/v1/candidates/missing',
    ])
  })

  it('answers null for a missing candidate', async () => {
    routes.candidates = list([])
    expect(
      await query({ op: 'readOne', collection: 'candidates', key: { id: 'nope' }, select: ['id'] }),
    ).toEqual({ record: null })
  })
})

describe('reports', () => {
  beforeEach(() => {
    routes.candidates = list([
      candidate('c1', { report_ids: ['r1', 'r2'] }),
      candidate('c2', { report_ids: ['r3'] }),
    ])
    routes.reports = list([
      {
        id: 'r1',
        candidate_id: 'c1',
        status: 'complete',
        result: 'clear',
        package: 'driver_pro',
        created_at: '2024-02-01T00:00:00Z',
        completed_at: '2024-02-03T00:00:00Z',
      },
      {
        id: 'r2',
        candidate_id: 'c1',
        status: 'pending',
        result: null,
        package: 'tasker_standard',
        created_at: '2024-03-01T00:00:00Z',
      },
      {
        id: 'r3',
        candidate_id: 'c2',
        status: 'complete',
        result: 'consider',
        package: 'driver_pro',
        created_at: '2024-02-01T00:00:00Z',
      },
    ])
  })

  it('requires a filter on id or candidate_id', async () => {
    await expect(
      query({ op: 'readMany', collection: 'reports', select: ['id'] }),
    ).rejects.toBeInstanceOf(QueryRejected)
  })

  it("reads a candidate's reports", async () => {
    const result = await query({
      op: 'readMany',
      collection: 'reports',
      select: ['id', 'status', 'result', 'completed_at'],
      filter: { in: { field: 'candidate_id' }, values: ['c1', 'c404'] },
    })

    expect(result).toEqual({
      records: [
        { id: 'r1', status: 'complete', result: 'clear', completed_at: '2024-02-03T00:00:00.000Z' },
        { id: 'r2', status: 'pending', result: null, completed_at: null },
      ],
    })
  })

  it('reads reports by id and applies the rest of the filter', async () => {
    const result = await query({
      op: 'readMany',
      collection: 'reports',
      select: ['id'],
      filter: {
        and: [
          { in: { field: 'id' }, values: ['r1', 'r3'] },
          { cmp: 'equals', left: { field: 'result' }, right: { value: 'consider' } },
        ],
      },
    })

    expect(result).toEqual({ records: [{ id: 'r3' }] })
  })
})

describe('invitations', () => {
  it('sends candidate and status filters to Checkr', async () => {
    routes.invitations = list([
      {
        id: 'i1',
        candidate_id: 'c1',
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      },
    ])

    const result = await query({
      op: 'readMany',
      collection: 'invitations',
      select: ['id', 'report_id', 'expires_at'],
      filter: {
        and: [
          { cmp: 'equals', left: { field: 'candidate_id' }, right: { value: 'c1' } },
          { cmp: 'equals', left: { field: 'status' }, right: { value: 'pending' } },
        ],
      },
    })

    expect(result).toEqual({
      records: [{ id: 'i1', report_id: null, expires_at: '2024-01-08T00:00:00.000Z' }],
    })
    expect(Object.fromEntries(calls[0]!.searchParams)).toMatchObject({
      candidate_id: 'c1',
      status: 'pending',
    })
  })
})

describe('errors', () => {
  it('reports a rejected key as access denied', async () => {
    routes.packages = () => Response.json({ error: 'Bad authentication error' }, { status: 401 })
    await expect(
      query({ op: 'readMany', collection: 'packages', select: ['id'] }),
    ).rejects.toBeInstanceOf(AccessDenied)
  })

  it('reports HTTP 429 as rate limited', async () => {
    routes.packages = () => new Response(null, { status: 429 })
    await expect(
      query({ op: 'readMany', collection: 'packages', select: ['id'] }),
    ).rejects.toBeInstanceOf(RateLimited)
  })

  it('passes Checkr validation errors on as rejected queries', async () => {
    routes.candidates = () => Response.json({ error: 'created_after is invalid' }, { status: 400 })

    const error = await query({ op: 'readMany', collection: 'candidates', select: ['id'] }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(QueryRejected)
    expect((error as Error).message).toContain('created_after is invalid')
  })

  it('is read-only', async () => {
    await expect(
      query({ op: 'deleteOne', collection: 'candidates', key: { id: 'c1' }, select: ['id'] }),
    ).rejects.toBeInstanceOf(QueryRejected)
  })

  it('tests the connection against the account', async () => {
    routes.account = () => ({ id: 'a1', object: 'account' })
    expect(await (await handlers()).testConnection?.()).toEqual({ ok: true })
    expect(calls[0]?.pathname).toBe('/v1/account')
  })
})
