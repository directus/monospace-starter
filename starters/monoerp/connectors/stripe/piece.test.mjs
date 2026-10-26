import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { resolveSource } from '../../infra/pieces.mjs'

const { source } = JSON.parse(readFileSync(new URL('piece.json', import.meta.url), 'utf8'))

it('preserves an explicitly empty Stripe key and the configured API address', () => {
  expect(
    resolveSource(source, {
      STRIPE_API_KEY: '',
      STRIPE_API_BASE: 'http://example.test',
    }).config,
  ).toEqual({ apiKey: '', apiBase: 'http://example.test' })
})
