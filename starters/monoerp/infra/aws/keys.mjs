// Generates Monospace's JWT key pair and KMS master key into the stage's key secrets, once.
// Does nothing if they're already set: replacing the KMS key makes everything Monospace
// encrypted with it unrecoverable.
//
//   pnpm aws keys --stage staging
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aws, hasValue, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

const secrets = {
  jwtPrivateKey: outputs.jwtPrivateKeySecret,
  jwtPublicKey: outputs.jwtPublicKeySecret,
  kmsMasterKey: outputs.kmsMasterKeySecret,
}

const set = Object.values(secrets).filter(hasValue).length

if (set === 3) {
  console.log(`Keys for ${stage} already exist. Not touching them.`)
  process.exit(0)
}

if (set > 0) {
  console.error(`Only some keys for ${stage} are set. Fix by hand; refusing to guess.`)
  process.exit(1)
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const values = {
  jwtPrivateKey: privateKey,
  jwtPublicKey: publicKey,
  kmsMasterKey: randomBytes(32).toString('base64'),
}

// Through a private temp file, so no key appears in the process list.
const dir = mkdtempSync(join(tmpdir(), 'monospace-keys-'))

try {
  for (const [name, secretId] of Object.entries(secrets)) {
    const file = join(dir, name)
    writeFileSync(file, values[name], { mode: 0o600 })
    aws(
      'secretsmanager',
      'put-secret-value',
      '--secret-id',
      secretId,
      '--secret-string',
      `file://${file}`,
    )
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(
  `Keys written for ${stage}. Back up these secrets; there is no way to recover the KMS key.`,
)
