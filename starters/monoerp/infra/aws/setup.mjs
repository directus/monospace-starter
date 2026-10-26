// Loads the stage's schemas (and demo data where the stage seeds), then configures the
// Monospace workspace, like `docker compose up` plus `pnpm setup:all` locally. Safe to rerun, so
// it's also how a stage picks up new migrations and schema changes.
//
//   pnpm aws:setup --stage staging
import { runTask, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

console.log(`Setting up ${stage}'s databases and Monospace workspace...`)

if (runTask(outputs, outputs.setupTaskDefinition) !== 0) process.exit(1)

console.log(`${stage} is set up.`)
