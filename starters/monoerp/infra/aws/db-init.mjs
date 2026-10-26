// Creates the `monospace` and `crm` Postgres users and databases, and syncs their passwords
// with the secrets. Safe to rerun.
//
//   pnpm aws:db-init --stage staging
import { runTask, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

console.log(`Setting up ${stage}'s database users...`)

if (runTask(outputs, outputs.dbInitTaskDefinition) !== 0) process.exit(1)

console.log(`Database users for ${stage} are in place.`)
