import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { resolveSource } from '../../infra/manifests.mjs'

const { source } = JSON.parse(readFileSync(new URL('connector.json', import.meta.url), 'utf8'))

it('keeps Portal TLS optional and converts configured database ports to numbers', () => {
  expect(resolveSource(source, {})).not.toHaveProperty('ssl')
  expect(
    resolveSource(source, {
      CUSTOMER_MYSQL_INTERNAL_PORT: '3333',
      DB_SSL_MODE: 'require',
    }),
  ).toMatchObject({ port: 3333, ssl: { mode: 'require' } })
})
