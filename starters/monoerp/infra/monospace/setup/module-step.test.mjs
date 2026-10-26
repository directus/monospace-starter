import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

import { selectSetupStep } from '../../manifests.mjs'

const manifests = ['sales', 'hiring'].map((id) => ({
  kind: 'module',
  id,
  setup: {
    beforeSchema: [{ title: `${id} seed`, script: 'seed.mjs', requires: ['portal'] }],
    afterSchema: [],
  },
}))

it('qualifies identical setup filenames by their owner', () => {
  expect(selectSetupStep('sales/seed.mjs', manifests, ['portal']).title).toBe('sales seed')
  expect(selectSetupStep('hiring/seed.mjs', manifests, ['portal']).title).toBe('hiring seed')
})

it('fails unknown or unqualified steps for installed owners, even when disabled', () => {
  expect(() => selectSetupStep('sales/typo.mjs', manifests, [])).toThrow('Unknown setup step')
  expect(() => selectSetupStep('seed.mjs', manifests, ['portal'])).toThrow('owner-qualified')
  expect(() => selectSetupStep(undefined, manifests, [])).toThrow('owner-qualified')
})

it('skips absent owners, disabled connectors, and steps with missing dependencies', () => {
  expect(selectSetupStep('absent/seed.mjs', manifests, ['portal'])).toBeUndefined()
  expect(selectSetupStep('sales/seed.mjs', manifests, [])).toBeUndefined()
  const connector = { ...manifests[0], kind: 'connector' }
  expect(selectSetupStep('sales/seed.mjs', [connector], ['portal'])).toBeUndefined()
  expect(selectSetupStep('sales/seed.mjs', [connector], ['portal', 'sales']).owner.id).toBe('sales')
})

it.each(['typo', 'source', 'extension', undefined])(
  'rejects connector action %s without executing it',
  (action) => {
    const args = [fileURLToPath(new URL('connector-step.mjs', import.meta.url))]

    if (action) args.push(action)
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Connector action must be migrate or provision')
  },
)
