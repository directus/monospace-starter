// Tells alchemy.sh whether the stage's Monospace service still runs and so holds the license
// (exit 0), or not (exit 1). The stage's saved outputs outlive a destroy that fails partway, so
// they can't answer this, and the release step is a deploy that would rebuild the stage.
import { awsJson, stackOutputs } from './lib.mjs'

const outputs = stackOutputs({ optional: true })

if (!outputs?.url) process.exit(1)

try {
  const { serviceArns } = awsJson('ecs', 'list-services', '--cluster', outputs.clusterArn)
  process.exit(serviceArns.some((arn) => arn.includes('/monoerp-monospace-')) ? 0 : 1)
} catch {
  process.exit(1)
}
