import { afterEach, describe, expect, it, vi } from 'vitest'

import { ensureRelation, monospaceProblem, request, runSetupStep } from './lib.mjs'

const seats = { meta: { violations: [{ entitlement: 'seats', hard_limit: 3 }] } }

const policies = { meta: { violations: [{ entitlement: 'custom_policies', hard_limit: 0 }] } }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function refuse(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('setup licensing', () => {
  it.each([
    ['Demo colleagues', seats, 'the free tier allows 3 users'],
    ['Custom access policy', policies, 'the free tier does not include custom policies'],
  ])('skips %s on a keyless install with a useful message', async (title, body, reason) => {
    vi.stubEnv('MONOSPACE_LICENSE__KEY', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    refuse(402, body)

    expect(await runSetupStep(title, () => request('/test'))).toBe(false)
    expect(log).toHaveBeenCalledExactlyOnceWith(
      `Skipped ${title}: ${reason}. Add a license key to enable it.`,
    )
  })

  it('does not hide license failures when a key is configured', async () => {
    vi.stubEnv('MONOSPACE_LICENSE__KEY', 'test-license')
    refuse(402, seats)

    await expect(runSetupStep('Demo colleagues', () => request('/test'))).rejects.toMatchObject({
      status: 402,
    })
  })

  it('keeps deployed setup strict even when only the backend receives the key', async () => {
    vi.stubEnv('MONOSPACE_LICENSE__KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    refuse(402, policies)

    await expect(
      runSetupStep('Custom access policy', () => request('/test')),
    ).rejects.toMatchObject({
      status: 402,
    })
  })

  it.each([401, 403, 422, 500])('still fails on HTTP %s without a key', async (status) => {
    vi.stubEnv('MONOSPACE_LICENSE__KEY', '')
    refuse(status, { message: 'Setup failed' })

    await expect(runSetupStep('Test step', () => request('/test'))).rejects.toMatchObject({
      status,
    })
  })

  it('still fails on a network error', async () => {
    vi.stubEnv('MONOSPACE_LICENSE__KEY', '')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))

    await expect(runSetupStep('Test step', () => request('/test'))).rejects.toThrow('Offline')
  })

  it('runs a successful step without a skip message', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(await runSetupStep('Test step', async () => {})).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })
})

it('creates a constrained cross-source join once and refuses a wrong existing target', () => {
  const collections = [
    {
      id: 'accounts',
      source: 'Portal',
      dbName: 'accounts',
      primitiveFields: [{ id: 'customer-id', dbName: 'stripe_customer_id' }],
      relationFields: [],
    },
    {
      id: 'customers',
      source: 'Stripe',
      dbName: 'customers',
      primitiveFields: [{ id: 'id', dbName: 'id' }],
      relationFields: [],
    },
  ]

  const relation = {
    relationName: 'accounts_stripe_customer',
    constrained: true,
    from: {
      source: 'Portal',
      collection: 'accounts',
      field: 'stripe_customer_id',
      apiName: 'stripeCustomer',
    },
    to: { source: 'Stripe', collection: 'customers', field: 'id', apiName: 'portalAccount' },
  }

  const [operation] = ensureRelation(collections, relation)
  expect(operation.data.data.firstField).toMatchObject({
    collectionId: 'accounts',
    fieldIds: ['customer-id'],
    isConstrained: true,
  })
  expect(operation.data.data.secondField).toMatchObject({
    collectionId: 'customers',
    isConstrained: false,
  })
  collections[0].relationFields.push({
    apiName: 'stripeCustomer',
    oppositeCollectionId: 'customers',
  })
  expect(ensureRelation(collections, relation)).toEqual([])
  collections[0].relationFields[0].oppositeCollectionId = 'wrong'
  expect(() => ensureRelation(collections, relation)).toThrow('points at the wrong collection')
})

describe('monospaceProblem', () => {
  const ours = { state: 'running', publishedPort: '8100' }

  it('passes when this project publishes Monospace on the port', () => {
    expect(monospaceProblem({ port: '8100', container: ours, answer: 'monospace' })).toBe('')
    expect(monospaceProblem({ port: '8100', container: ours, answer: 'none' })).toBe('')
  })

  it.each([
    ['another app has the port', null, 'monospace'],
    ['our container never bound it', { state: 'created', publishedPort: '' }, 'monospace'],
    ['a host app shadows our published port', ours, 'other'],
  ])('blames the port when %s', (_, container, answer) => {
    const problem = monospaceProblem({ port: '8100', container, answer })

    expect(problem).toContain("Port 8100 isn't this project's Monospace.")
    expect(problem).toContain('docker ps --filter publish=8100')
    expect(problem).toContain('lsof -i :8100')
    expect(problem).toContain('change MONOSPACE_PORT in .env, then run docker compose up -d')
  })

  it('asks to republish when our container runs on another port and nothing answers', () => {
    const problem = monospaceProblem({
      port: '8100',
      container: { state: 'running', publishedPort: '8200' },
      answer: 'none',
    })

    expect(problem).toContain("isn't published on port 8100")
    expect(problem).toContain('docker compose up -d')
    expect(problem).not.toContain("isn't this project's Monospace")
  })

  it('asks to start the stack when nothing answers, without blaming a port', () => {
    const problem = monospaceProblem({ port: '8100', container: null, answer: 'none' })

    expect(problem).toContain('docker compose up -d')
    expect(problem).toContain('docker compose down in old copies')
    expect(problem).toContain('docker network prune')
    expect(problem).not.toContain('8100')
  })

  it('mentions the port when our container exists but stopped', () => {
    const problem = monospaceProblem({
      port: '8100',
      container: { state: 'exited', publishedPort: '' },
      answer: 'none',
    })

    expect(problem).toContain('If that fails on port 8100, something else has it.')
  })

  it('explains a license refusal from a crash loop', () => {
    const logs = [
      'Starting Monospace',
      'ERROR License entitlement check failed: usage exceeds hard limit',
    ].join('\n')

    const problem = monospaceProblem({
      port: '8100',
      container: { state: 'restarting', publishedPort: '' },
      answer: 'none',
      logs,
    })

    expect(problem).toContain('keeps restarting')
    expect(problem).toContain('ERROR License entitlement check failed')
    expect(problem).not.toContain('Starting Monospace')
    expect(problem).toContain('COMPOSE_PROJECT_NAME')
  })

  it('shows the last lines of any other crash loop', () => {
    const problem = monospaceProblem({
      port: '8100',
      container: { state: 'restarting', publishedPort: '' },
      answer: 'none',
      logs: 'boot\nconnection refused',
    })

    expect(problem).toContain('boot\nconnection refused')
    expect(problem).not.toContain('COMPOSE_PROJECT_NAME')
  })
})
