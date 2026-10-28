import { readFileSync } from 'node:fs'

import { expect, it } from 'vitest'

import { resolveSource } from '../../infra/manifests.mjs'

const {
  'x-monoerp': { source },
} = JSON.parse(readFileSync(new URL('connector.json', import.meta.url), 'utf8'))

it('uses the local Checkr source without a key and the selected hosted environment with one', () => {
  expect(resolveSource(source, {})).toEqual({
    apiName: 'Checkr',
    provider: 'monoerp/checkr-data-connector',
    config: { apiKey: 'monoerp_local', apiBase: 'http://checkr:4020' },
  })
  expect(resolveSource(source, { CHECKR_API_KEY: 'test', CHECKR_ENVIRONMENT: '' }).config).toEqual({
    apiKey: 'test',
    environment: 'staging',
  })
  expect(
    resolveSource(source, {
      CHECKR_API_KEY: 'test',
      CHECKR_API_BASE: 'ignored',
      CHECKR_ENVIRONMENT: 'production',
    }).config,
  ).toEqual({ apiKey: 'test', environment: 'production' })
})
