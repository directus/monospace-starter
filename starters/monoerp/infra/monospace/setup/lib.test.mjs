import { afterEach, describe, expect, it, vi } from 'vitest'

import { request, runSetupStep } from './lib.mjs'

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
    ['Demo colleagues', seats, 'the free Starter tier allows 3 users'],
    ['Custom access policy', policies, 'the free Starter tier does not include custom policies'],
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
