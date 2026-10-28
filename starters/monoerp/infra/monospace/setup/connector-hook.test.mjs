import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

it.each(['typo', 'source', 'extension', undefined])(
  'rejects connector action %s without executing it',
  (action) => {
    const args = [fileURLToPath(new URL('connector-hook.mjs', import.meta.url))]

    if (action) args.push(action)
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Connector action must be migrate or provision')
  },
)
