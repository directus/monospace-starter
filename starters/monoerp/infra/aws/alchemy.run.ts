import * as Alchemy from 'alchemy'
import * as AWS from 'alchemy/AWS'
import * as Output from 'alchemy/Output'
import * as Effect from 'effect/Effect'
import { Data } from './data.ts'
import { Network, ports } from './network.ts'
import { GithubDeployRole } from './github.ts'
import { Firewall, Operations } from './operations.ts'
import { Secrets } from './secrets.ts'
import { DbInit, OneOffTask, Services, Setup } from './services.ts'
import { stageConfig } from './stages.ts'

export default Alchemy.Stack(
  'MonoErp',
  { providers: AWS.providers(), state: AWS.state() },
  Effect.gen(function* () {
    const { stage } = yield* Alchemy.Stack
    const config = stageConfig(stage)

    const network = yield* Network(config)
    const data = yield* Data(config, network)
    const secrets = yield* Secrets(config.retain)

    const cluster = yield* AWS.ECS.Cluster('Cluster', {})
    const dbInit = yield* DbInit(data)

    // alchemy.sh sets this on a stage's first deploy, so keys, the license, and the database
    // users exist before any service tries to start.
    const services =
      process.env.MONOERP_DATA_ONLY === '1'
        ? undefined
        : yield* Services(cluster, config, network, data, secrets, yield* Firewall(config))

    const setup = services
      ? yield* Setup(config, services.url, data, secrets, services.mailpit?.url)
      : undefined

    const operations = services
      ? yield* Operations(stage, config, cluster, services, data)
      : undefined

    const githubRole = GithubDeployRole(stage)
    const deployRole = githubRole ? yield* githubRole : undefined

    // One-off check that every data store answers from inside the private subnets. Run it with
    // `pnpm aws:probe`; it tries every store and exits non-zero if any is unreachable.
    const checks = [
      ['POSTGRES', data.postgres.endpointAddress, ports.postgres],
      ['VALKEY', data.valkey.primaryEndpointAddress, ports.valkey],
      ...(data.portalMysql
        ? [['MYSQL', data.portalMysql.endpointAddress, ports.mysql] as const]
        : []),
      ...(data.broker
        ? [
            [
              'BROKER',
              Output.map(data.broker.endpoints, (urls) => new URL(urls?.[0] ?? '').hostname),
              ports.amqps,
            ] as const,
          ]
        : []),
    ] as const

    const probe = yield* OneOffTask('DataProbe', {
      image: 'public.ecr.aws/docker/library/alpine:3.22',
      environment: Object.fromEntries(checks.map(([name, host]) => [`${name}_HOST`, host])),
      command: [
        'sh',
        '-c',
        [
          'fail=0',
          ...checks.map(([name, , port]) => `nc -zvw5 "$${name}_HOST" ${port} || fail=1`),
          'exit $fail',
        ].join('; '),
      ],
    })

    return {
      stage,
      url: services?.url,
      studioUrl: services?.studioUrl,
      clusterArn: cluster.clusterArn,
      probeTaskDefinition: probe.taskDefinitionArn,
      dbInitTaskDefinition: dbInit.taskDefinitionArn,
      setupTaskDefinition: setup?.taskDefinitionArn,
      privateSubnetIds: network.vpc.privateSubnetIds,
      tasksSecurityGroupId: network.tasks.groupId,
      postgresHost: data.postgres.endpointAddress,
      portalMysqlHost: data.portalMysql?.endpointAddress,
      valkeyHost: data.valkey.primaryEndpointAddress,
      brokerEndpoints: data.broker?.endpoints,
      assetsBucket: data.assets.bucketName,
      jwtPrivateKeySecret: secrets.jwtPrivateKey.secretArn,
      jwtPublicKeySecret: secrets.jwtPublicKey.secretArn,
      kmsMasterKeySecret: secrets.kmsMasterKey.secretArn,
      licenseSecret: secrets.license.secretArn,
      adminPasswordSecret: secrets.admin.secret.secretArn,
      mailpitService: services?.mailpit?.serviceName,
      alarmTopicArn: operations?.alarmTopicArn,
      githubDeployRoleArn: deployRole?.roleArn,
    }
  }),
)
