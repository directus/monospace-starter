// Shared helpers for the scripts that act on a deployed stage. They use the AWS CLI, so
// AWS_PROFILE and an `aws sso login` session are all they need.
import { execFileSync } from 'node:child_process'

export const region = process.env.AWS_REGION ?? 'us-east-1'

export const stage = (() => {
  const index = process.argv.indexOf('--stage')

  return index === -1 ? 'staging' : process.argv[index + 1]
})()

export const aws = (...args) =>
  execFileSync('aws', [...args, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

export const awsJson = (...args) => JSON.parse(aws(...args) || 'null')

// Fails with a sign-in hint instead of a CLI stack of errors.
export const signedIn = () => {
  try {
    return awsJson('sts', 'get-caller-identity').Account
  } catch {
    const profile = process.env.AWS_PROFILE
    console.error(
      `Not signed in to AWS${profile ? ` (profile ${profile})` : ''}. Run: aws sso login${profile ? ` --profile ${profile}` : ''}`,
    )
    process.exit(1)
  }
}

// The deploy's outputs, which Alchemy stores as plain JSON next to the stage's state.
// Returns undefined when `optional` and the stage has never been deployed.
export const stackOutputs = ({ optional = false } = {}) => {
  const account = signedIn()
  const key = `s3://alchemy-state-${account}-${region}-an/MonoErp/${stage}/__stack_output__.json`

  try {
    return JSON.parse(
      execFileSync('aws', ['s3', 'cp', key, '-'], { encoding: 'utf8', stdio: 'pipe' }),
    )
  } catch {
    if (optional) return undefined
    console.error(`No deploy found for stage "${stage}". Run: pnpm aws deploy --stage ${stage}`)
    process.exit(1)
  }
}

// Runs a one-off task in the private subnets, prints its logs, and returns its exit code.
// `overrides` is ECS's run-task overrides object (command, environment); log lines are also
// pushed to `logLines` when given.
export const runTask = (outputs, taskDefinition, overrides, logLines) => {
  const { tasks, failures } = awsJson(
    'ecs',
    'run-task',
    '--cluster',
    outputs.clusterArn,
    '--task-definition',
    taskDefinition,
    '--launch-type',
    'FARGATE',
    '--network-configuration',
    JSON.stringify({
      awsvpcConfiguration: {
        subnets: outputs.privateSubnetIds,
        securityGroups: [outputs.tasksSecurityGroupId],
        assignPublicIp: 'DISABLED',
      },
    }),
    ...(overrides ? ['--overrides', JSON.stringify(overrides)] : []),
  )

  if (!tasks.length) {
    console.error('ECS did not start the task:', failures)

    return 1
  }

  const taskArn = tasks[0].taskArn
  console.log('Waiting for it to finish (usually under a minute)...')
  aws('ecs', 'wait', 'tasks-stopped', '--cluster', outputs.clusterArn, '--tasks', taskArn)

  const [task] = awsJson(
    'ecs',
    'describe-tasks',
    '--cluster',
    outputs.clusterArn,
    '--tasks',
    taskArn,
  ).tasks

  const container = task.containers[0]

  const { taskDefinition: definition } = awsJson(
    'ecs',
    'describe-task-definition',
    '--task-definition',
    taskDefinition,
  )

  const options = definition.containerDefinitions[0].logConfiguration?.options ?? {}

  try {
    const { events } = awsJson(
      'logs',
      'get-log-events',
      '--log-group-name',
      options['awslogs-group'],
      '--log-stream-name',
      `${options['awslogs-stream-prefix']}/${container.name}/${taskArn.split('/').pop()}`,
    )

    for (const event of events) {
      console.log(`  ${event.message}`)
      logLines?.push(event.message)
    }
  } catch {
    console.log('  (no logs; the task may have failed before starting)')
  }

  if (container.exitCode !== 0) {
    console.error(
      `Task failed: exit code ${container.exitCode ?? 'none'}${task.stoppedReason ? `, ${task.stoppedReason}` : ''}.`,
    )
  }

  return container.exitCode ?? 1
}

export const hasValue = (secretId) =>
  awsJson('secretsmanager', 'list-secret-version-ids', '--secret-id', secretId).Versions.length > 0
