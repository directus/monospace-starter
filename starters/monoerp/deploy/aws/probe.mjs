// Runs the Probe task in the stage's private subnets and reports which data stores answer.
//
//   pnpm aws probe --stage staging
import { runTask, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

console.log(`Probing ${stage}'s data stores from the private subnets...`)

if (runTask(outputs, outputs.probeTaskDefinition) !== 0) process.exit(1)

console.log(`All data stores in ${stage} are reachable from the private subnets.`)
