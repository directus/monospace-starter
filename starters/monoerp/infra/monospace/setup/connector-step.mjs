import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { connectors, logMissingConnectors } from './connectors.mjs'

const action = process.argv[2]

if (!['migrate', 'provision'].includes(action) || process.argv.length !== 3)
  throw new Error('Connector action must be migrate or provision')

logMissingConnectors()

for (const connector of connectors) {
  if (!connector[action]) continue
  execFileSync('sh', [fileURLToPath(new URL(connector[action], connector.directory))], {
    stdio: 'inherit',
  })
}
