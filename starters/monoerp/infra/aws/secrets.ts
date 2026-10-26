import * as Alchemy from 'alchemy'
import * as AWS from 'alchemy/AWS'
import * as RemovalPolicy from 'alchemy/RemovalPolicy'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// A generated password in its own secret. Secrets hold one plain value each: Alchemy's ECS
// services grant read access per secret ARN, which doesn't cover `arn:...:jsonKey::` refs.
// The value also lives in Alchemy state; if state is lost, the next deploy mints a new one
// and the user has to be reset to match. 16 bytes (32 hex characters) fits MySQL's limit.
export const Credential = (id: string, username: string) =>
  Effect.gen(function* () {
    const random = yield* Alchemy.Random(`${id}Password`, { bytes: 16 })

    const secret = yield* AWS.SecretsManager.Secret(id, {
      description: `Password for ${username}`,
      secretString: random.text,
    })

    return { username, password: random.text, secret }
  })

// Values Alchemy must never generate or overwrite: `pnpm aws:keys` fills the key material
// once, and `pnpm aws:license` copies the license from .env. Losing the KMS key makes
// encrypted data unrecoverable, so these are only ever written outside the stack.
export const Secrets = (retain: boolean) =>
  Effect.gen(function* () {
    const keySecret = (id: string, description: string) =>
      AWS.SecretsManager.Secret(id, { description }).pipe(RemovalPolicy.retain(retain))

    const jwtPrivateKey = yield* keySecret('JwtPrivateKey', 'Monospace JWT signing key (PEM)')
    const jwtPublicKey = yield* keySecret('JwtPublicKey', 'Monospace JWT public key (PEM)')
    const kmsMasterKey = yield* keySecret('KmsMasterKey', 'Monospace KMS master key (base64)')

    const license = yield* AWS.SecretsManager.Secret('MonospaceLicense', {
      description: 'Monospace license key. Copied from .env by pnpm aws:license.',
    })

    const admin = yield* Credential('MonospaceAdminCredentials', 'admin')
    // Optional company logos in the app (apps/web/server/logo.ts). Without it, logos are off.
    const logoToken = envValue('LOGO_DEV_TOKEN')

    const logoDevToken = logoToken
      ? yield* AWS.SecretsManager.Secret('LogoDevToken', {
          description: 'logo.dev token for the monoERP app',
          secretString: Redacted.make(logoToken),
        })
      : undefined

    return { jwtPrivateKey, jwtPublicKey, kmsMasterKey, license, admin, logoDevToken }
  })

// A value from the environment, falling back to the repo's .env (only the key asked for).
export function envValue(name: string) {
  if (process.env[name]) return process.env[name]

  try {
    return parseEnv(readFileSync(`${import.meta.dirname}/../../.env`, 'utf8'))[name] || undefined
  } catch {
    return undefined
  }
}
