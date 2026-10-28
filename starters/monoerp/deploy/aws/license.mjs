// Copies MONOSPACE_LICENSE__KEY (from the environment, else the repo's .env) into the stage's
// license secret. The key is never printed or passed on a command line.
//
//   pnpm aws license --stage staging
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import { aws, stackOutputs, stage } from './lib.mjs'

const envFile = join(import.meta.dirname, '../../.env')

const key =
  process.env.MONOSPACE_LICENSE__KEY ||
  (existsSync(envFile) && parseEnv(readFileSync(envFile, 'utf8')).MONOSPACE_LICENSE__KEY)

if (!key) {
  console.error(`MONOSPACE_LICENSE__KEY is empty in the environment and in ${envFile}.`)
  process.exit(1)
}

const secretId = stackOutputs().licenseSecret

const current = (() => {
  try {
    return JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', secretId))
      .SecretString
  } catch {
    return undefined
  }
})()

if (current === key) {
  console.log(`The ${stage} license is already set.`)
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'monospace-license-'))

const file = join(dir, 'value')

try {
  writeFileSync(file, key, { mode: 0o600 })
  aws(
    'secretsmanager',
    'put-secret-value',
    '--secret-id',
    secretId,
    '--secret-string',
    `file://${file}`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`License copied from .env to ${stage}${current ? ' (replaced the old value)' : ''}.`)
