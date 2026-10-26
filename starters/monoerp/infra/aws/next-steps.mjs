// Printed after a deploy: where the stage is, how to sign in, and anything left to do.
import { hasValue, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

const steps = []

if (![outputs.jwtPrivateKeySecret, outputs.kmsMasterKeySecret].every(hasValue)) {
  steps.push(`Generate Monospace's keys:  pnpm aws:keys --stage ${stage}`)
}

if (!hasValue(outputs.licenseSecret)) {
  steps.push(`Copy the license key from .env:  pnpm aws:license --stage ${stage}`)
}

if (!outputs.url) steps.push(`Finish the deploy:  pnpm aws:deploy --stage ${stage}`)

if (outputs.url) {
  console.log(`\n${stage} is at ${outputs.url} (Studio: ${outputs.studioUrl})`)
  console.log(`Sign in as admin@example.com. The password:`)
  console.log(
    `  aws secretsmanager get-secret-value --secret-id ${outputs.adminPasswordSecret} --query SecretString --output text`,
  )
}

if (steps.length) {
  console.log(`\nNext steps for ${stage}:`)
  steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`))
}
