// Opens the stage's Mailpit inbox at http://localhost:8025 through an SSM tunnel, so it never
// needs a public address. Stays open until Ctrl+C. Needs AWS's Session Manager plugin.
//
//   pnpm aws mail --stage staging
import { execFileSync, spawn } from 'node:child_process'
import { awsJson, region, stackOutputs, stage } from './lib.mjs'

const localPort = process.env.MAILPIT_PORT ?? '8025'

try {
  execFileSync('session-manager-plugin', ['--version'], { stdio: 'ignore' })
} catch {
  console.error(
    'The AWS Session Manager plugin is missing. Install it: brew install --cask session-manager-plugin',
  )
  process.exit(1)
}

const outputs = stackOutputs()

if (!outputs.mailpitService) {
  console.error(`${stage} has no Mailpit. Only stages with mailCatcher in stages.ts run one.`)
  process.exit(1)
}

const { taskArns } = awsJson(
  'ecs',
  'list-tasks',
  '--cluster',
  outputs.clusterArn,
  '--service-name',
  outputs.mailpitService,
  '--desired-status',
  'RUNNING',
)

if (!taskArns.length) {
  console.error(`Mailpit isn't running in ${stage}. Check its service in the ECS console.`)
  process.exit(1)
}

const [task] = awsJson(
  'ecs',
  'describe-tasks',
  '--cluster',
  outputs.clusterArn,
  '--tasks',
  taskArns[0],
).tasks

const cluster = outputs.clusterArn.split('/').pop()

const taskId = task.taskArn.split('/').pop()

const target = `ecs:${cluster}_${taskId}_${task.containers[0].runtimeId}`

console.log(`${stage}'s inbox: http://localhost:${localPort} (Ctrl+C to close)`)

const session = spawn(
  'aws',
  [
    'ssm',
    'start-session',
    '--region',
    region,
    '--target',
    target,
    '--document-name',
    'AWS-StartPortForwardingSession',
    '--parameters',
    JSON.stringify({ portNumber: ['8025'], localPortNumber: [localPort] }),
  ],
  { stdio: 'inherit' },
)

session.on('exit', (code) => process.exit(code ?? 0))
