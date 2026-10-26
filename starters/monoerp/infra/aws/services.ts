import { z } from 'zod'
import * as AWS from 'alchemy/AWS'
import * as Output from 'alchemy/Output'
import * as Effect from 'effect/Effect'
import type { Data } from './data.ts'
import type { Network } from './network.ts'
import { ports, servicePorts } from './network.ts'
import { Credential, type Secrets } from './secrets.ts'
import type { StageConfig } from './stages.ts'

const piecesModule = await import(new URL('../pieces.mjs', import.meta.url).href)

// Same pinned release as docker-compose.yml.
const monospaceImage =
  'monospace/monospace:v1.0.0@sha256:bb82b12e61510699d241c08a3f7c74120cac692031272a9f70460ebb56fa34b7'

// Same release as docker-compose.yml.
const mailpitImage = 'axllent/mailpit:v1.27'

const repoRoot = `${import.meta.dirname}/../..`

const arm64 = { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' } as const

const region = process.env.AWS_REGION ?? 'us-east-1'

const studioHeader = { 'x-monospace-site': 'studio' }

type TargetGroupArn = `arn:aws:elasticloadbalancing:${string}:${string}:targetgroup/${string}`

const isTargetGroupArn = (arn: string): arn is TargetGroupArn =>
  arn.startsWith('arn:aws:elasticloadbalancing:') && arn.includes(':targetgroup/')

// alchemy types a service's target group as an optional string, since not every service has a
// load balancer. Ours always does, so a missing one fails the deploy here.
const targetGroupOf = (arn: Output.Output<string | undefined>) =>
  Output.map(arn, (value) => {
    if (!value || !isTargetGroupArn(value))
      throw new Error(`Expected a target group ARN, got ${value}`)

    return value
  })

export const Services = (
  cluster: AWS.ECS.Cluster,
  config: StageConfig,
  network: Network,
  data: Effect.Success<ReturnType<typeof Data>>,
  secrets: Effect.Success<ReturnType<typeof Secrets>>,
  firewall: AWS.WAFv2.WebACL,
) =>
  Effect.gen(function* () {
    const { vpc, alb: albSecurityGroup, tasks } = network

    const placement = {
      vpcId: vpc.vpcId,
      subnets: vpc.privateSubnetIds,
      securityGroups: [tasks.groupId],
      assignPublicIp: false,
    }

    // Same routing as infra/caddy/Caddyfile: /api/* to Monospace, everything else to the app.
    const alb = yield* AWS.ELBv2.LoadBalancer('LoadBalancer', {
      type: 'application',
      scheme: 'internet-facing',
      subnets: vpc.publicSubnetIds,
      securityGroups: [albSecurityGroup.groupId],
    })

    const listener = yield* AWS.ELBv2.Listener('HttpListener', {
      loadBalancerArn: alb.loadBalancerArn,
      port: 80,
      protocol: 'HTTP',
      defaultActions: [
        { type: 'fixedResponse', statusCode: '404', contentType: 'text/plain', messageBody: '' },
      ],
    })

    // HTTPS without a domain: CloudFront's own certificate, everything passed through to the
    // load balancer uncached, except the content-hashed build files under `assetPath`, which
    // are cached at the edge and compressed. A custom domain replaces this with ACM.
    const passThrough = (
      id: string,
      comment: string,
      assetPath: string,
      customHeaders?: Record<string, string>,
    ) =>
      AWS.CloudFront.Distribution(id, {
        comment,
        priceClass: 'PriceClass_100',
        webAclId: firewall.webAclArn,
        origins: [
          {
            id: 'alb',
            domainName: alb.dnsName,
            customOriginConfig: {
              originProtocolPolicy: 'http-only',
              originReadTimeout: '60 seconds',
            },
            customHeaders,
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: 'alb',
          viewerProtocolPolicy: 'redirect-to-https',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
          cachedMethods: ['GET', 'HEAD'],
          compress: true,
          cachePolicyId: AWS.CloudFront.MANAGED_CACHING_DISABLED_POLICY_ID,
          originRequestPolicyId: AWS.CloudFront.MANAGED_ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID,
        },
        orderedCacheBehaviors: [
          {
            pathPattern: assetPath,
            targetOriginId: 'alb',
            viewerProtocolPolicy: 'redirect-to-https',
            allowedMethods: ['GET', 'HEAD'],
            cachedMethods: ['GET', 'HEAD'],
            compress: true,
            cachePolicyId: AWS.CloudFront.MANAGED_CACHING_OPTIMIZED_POLICY_ID,
            // Updating a distribution needs these spelled out on extra behaviors, and Alchemy
            // doesn't default them.
            smoothStreaming: false,
            fieldLevelEncryptionId: '',
            trustedSigners: [],
            functionAssociations: [],
            lambdaFunctionAssociations: [],
          },
        ],
      })

    const cdn = yield* passThrough('Cdn', 'monoERP', '/assets/*')
    // Studio is a single-page app at Monospace's root, so it can't share the app's address. Its
    // own distribution tags requests with a header the load balancer routes to Monospace.
    const studioCdn = yield* passThrough('StudioCdn', 'Monospace Studio', '/_nuxt/*', studioHeader)
    const url = Output.interpolate`https://${cdn.domainName}`

    // Staging's RabbitMQ and Mailpit tasks are found at <name>.monoerp.internal.
    const namespace =
      !data.broker || config.mailCatcher
        ? yield* AWS.CloudMap.PrivateDnsNamespace('InternalDns', {
            name: 'monoerp.internal',
            vpc: vpc.vpcId,
          })
        : undefined

    const internalName = (id: string, name: string) => {
      if (!namespace) throw new Error(`No private DNS namespace for ${name}`)

      return AWS.CloudMap.Service(id, {
        name,
        namespaceId: namespace.namespaceId,
        dnsRecords: [{ type: 'A', ttl: '10 seconds' }],
      })
    }

    // Staging runs RabbitMQ as a task; prod uses Amazon MQ.
    const rabbitmq = data.broker
      ? {
          host: Output.map(data.broker.endpoints, (urls) => new URL(urls?.[0] ?? '').hostname),
          port: ports.amqps,
          tls: true,
        }
      : yield* Effect.gen(function* () {
          const registry = yield* internalName('RabbitmqDns', 'rabbitmq')

          yield* AWS.ECS.Service('Rabbitmq', {
            cluster,
            ...placement,
            image: 'rabbitmq:3.13-alpine',
            port: servicePorts.amqp,
            cpu: 256,
            memory: 512,
            runtimePlatform: arm64,
            desiredCount: 1,
            serviceRegistries: [{ registryArn: registry.serviceArn }],
            env: { RABBITMQ_DEFAULT_USER: data.rabbitmq.username },
            secrets: { RABBITMQ_DEFAULT_PASS: data.rabbitmq.secret.secretArn },
            logging: { retention: '2 weeks' },
          })

          return { host: 'rabbitmq.monoerp.internal', port: servicePorts.amqp, tls: false }
        })

    // Staging's mail server. No public address: `pnpm aws:mail` opens its inbox through an SSM
    // tunnel, which needs ECS Exec and the SSM policy on the task role.
    const mailpit = config.mailCatcher
      ? yield* Effect.gen(function* () {
          const registry = yield* internalName('MailpitDns', 'mailpit')

          const service = yield* AWS.ECS.Service('Mailpit', {
            cluster,
            ...placement,
            image: mailpitImage,
            port: servicePorts.mailpit,
            cpu: 256,
            memory: 512,
            runtimePlatform: arm64,
            desiredCount: 1,
            serviceRegistries: [{ registryArn: registry.serviceArn }],
            enableExecuteCommand: true,
            taskRoleManagedPolicyArns: ['arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'],
            env: { MP_SMTP_AUTH_ACCEPT_ANY: '1', MP_SMTP_AUTH_ALLOW_INSECURE: '1' },
            logging: { retention: '2 weeks' },
          })

          return {
            host: 'mailpit.monoerp.internal',
            url: `http://mailpit.monoerp.internal:${servicePorts.mailpit}`,
            serviceName: service.serviceName,
          }
        })
      : undefined

    // Same settings as docker-compose.yml. Mailpit accepts any credentials.
    const emailer = mailpit
      ? {
          MONOSPACE_SYSTEM_EMAILER__PROVIDER: 'smtp',
          MONOSPACE_SYSTEM_EMAILER__HOST: mailpit.host,
          MONOSPACE_SYSTEM_EMAILER__PORT: String(servicePorts.smtp),
          MONOSPACE_SYSTEM_EMAILER__TLS: 'false',
          MONOSPACE_SYSTEM_EMAILER__USERNAME: 'mailpit',
          MONOSPACE_SYSTEM_EMAILER__PASSWORD: 'mailpit',
          MONOSPACE_SYSTEM_EMAILER__FROM_ADDRESS: 'monoerp@example.com',
          MONOSPACE_SYSTEM_EMAILER__FROM_NAME: 'monoERP',
        }
      : {}

    const monospaceSecrets = {
      MONOSPACE_SYSTEM_DATABASE__PASSWORD: data.monospaceDb.secret.secretArn,
      MONOSPACE_SYSTEM_FILE_STORAGE__SECRET_ACCESS_KEY: data.assetsSecretKey.secretArn,
      MONOSPACE_RABBITMQ__PASSWORD: data.rabbitmq.secret.secretArn,
      MONOSPACE_JWT_PRIVATE_KEY: secrets.jwtPrivateKey.secretArn,
      MONOSPACE_JWT_PUBLIC_KEY: secrets.jwtPublicKey.secretArn,
      MONOSPACE_KMS__MASTER_KEY: secrets.kmsMasterKey.secretArn,
      MONOSPACE_ADMIN_PASSWORD: secrets.admin.secret.secretArn,
    }

    const monospace = yield* AWS.ECS.Service('Monospace', {
      cluster,
      ...placement,
      image: monospaceImage,
      port: servicePorts.monospace,
      cpu: config.monospace.cpu,
      memory: config.monospace.memory,
      runtimePlatform: arm64,
      desiredCount: config.monospace.count,
      loadBalancer: {
        listener,
        rules: [{ path: '/api/*', priority: 11 }],
        health: {
          [`${servicePorts.monospace}/http`]: {
            path: '/api/system/ready',
            interval: '15 seconds',
            healthyThreshold: 2,
          },
        },
      },
      // Startup runs migrations and, the first time, creates the admin.
      healthCheckGracePeriod: '3 minutes',
      deploymentConfiguration: {
        deploymentCircuitBreaker: { enable: true, rollback: true },
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
      // Longer than the drain delay plus the grace period below.
      container: { stopTimeout: 45 },
      env: {
        MONOSPACE_HOST: '0.0.0.0',
        MONOSPACE_PORT: String(servicePorts.monospace),
        MONOSPACE_BASE_URL: url,
        MONOSPACE_SHUTDOWN_DRAIN_DELAY: '10s',
        MONOSPACE_SHUTDOWN_GRACE_PERIOD: '30s',

        MONOSPACE_SYSTEM_DATABASE__PROVIDER: 'postgres',
        MONOSPACE_SYSTEM_DATABASE__HOST: data.postgres.endpointAddress,
        MONOSPACE_SYSTEM_DATABASE__PORT: String(ports.postgres),
        MONOSPACE_SYSTEM_DATABASE__USER: data.monospaceDb.username,
        MONOSPACE_SYSTEM_DATABASE__DBNAME: 'monospace',
        MONOSPACE_SYSTEM_DATABASE__SSL__MODE: 'require',

        MONOSPACE_SYSTEM_FILE_STORAGE__PROVIDER: 's3',
        MONOSPACE_SYSTEM_FILE_STORAGE__BUCKET: data.assets.bucketName,
        MONOSPACE_SYSTEM_FILE_STORAGE__REGION: region,
        MONOSPACE_SYSTEM_FILE_STORAGE__ACCESS_KEY_ID: data.assetsAccessKeyId,
        MONOSPACE_MAX_FILE_PAYLOAD_SIZE: '25m',

        MONOSPACE_CACHE__INCLUDE_STATUS_HEADER: String(config.cacheStatusHeader),
        MONOSPACE_REDIS__URL: Output.interpolate`valkeys://${data.valkey.primaryEndpointAddress}:${ports.valkey}`,

        MONOSPACE_RABBITMQ__HOST: rabbitmq.host,
        MONOSPACE_RABBITMQ__PORT: String(rabbitmq.port),
        MONOSPACE_RABBITMQ__USER: data.rabbitmq.username,
        MONOSPACE_RABBITMQ__USE_TLS: String(rabbitmq.tls),

        MONOSPACE_KMS__TYPE: 'monospace',
        MONOSPACE_ADMIN_EMAIL: 'admin@example.com',
        ...emailer,
      },
      // alchemy.sh sets MONOERP_RELEASE_LICENSE before a destroy: Monospace releases an online
      // activation when it starts without a key, so the key can be activated again elsewhere.
      secrets:
        process.env.MONOERP_RELEASE_LICENSE === '1'
          ? monospaceSecrets
          : { ...monospaceSecrets, MONOSPACE_LICENSE__KEY: secrets.license.secretArn },
      logging: { retention: '30 days' },
    })

    // Studio's header rule is its own resource: adding it to the service's rules renumbered them
    // and the deploy dropped the /api/* rule.
    yield* AWS.ELBv2.ListenerRule('StudioRule', {
      listenerArn: listener.listenerArn,
      priority: 5,
      conditions: [
        { httpHeader: { name: Object.keys(studioHeader)[0], values: Object.values(studioHeader) } },
      ],
      actions: [
        {
          type: 'forward',
          targetGroups: [
            {
              targetGroupArn: targetGroupOf(monospace.targetGroupArn),
            },
          ],
        },
      ],
    })

    // The app only renders the page shell and proxies logos; the browser talks to Monospace
    // through the same load balancer, like Caddy locally.
    const app = yield* AWS.ECS.Service('App', {
      cluster,
      ...placement,
      context: repoRoot,
      dockerfile: `${repoRoot}/apps/web/Dockerfile`,
      port: servicePorts.app,
      cpu: config.app.cpu,
      memory: config.app.memory,
      runtimePlatform: arm64,
      desiredCount: config.app.count,
      loadBalancer: {
        listener,
        rules: [{ path: '/*', priority: 20000 }],
        health: { [`${servicePorts.app}/http`]: { path: '/', interval: '15 seconds' } },
      },
      deploymentConfiguration: {
        deploymentCircuitBreaker: { enable: true, rollback: true },
        minimumHealthyPercent: 100,
        maximumPercent: 200,
      },
      env: { HOST: '0.0.0.0', PORT: String(servicePorts.app) },
      secrets: secrets.logoDevToken ? { LOGO_DEV_TOKEN: secrets.logoDevToken.secretArn } : {},
      logging: { retention: '30 days' },
    })

    return {
      url,
      studioUrl: Output.interpolate`https://${studioCdn.domainName}`,
      loadBalancerArn: alb.loadBalancerArn,
      monospace,
      app,
      mailpit,
    }
  })

// A one-off task definition that can read secrets, with 30-day logs. A raw task definition with
// its own execution role, because Alchemy's ECS Task can't inject secrets or set log retention.
export const OneOffTask = (
  id: string,
  props: {
    image: string | Output.Output<string>
    command?: string[]
    environment: Record<string, string | Output.Output<string | undefined>>
    secrets?: Record<string, Output.Output<string>>
  },
) =>
  Effect.gen(function* () {
    const role = yield* AWS.IAM.Role(`${id}ExecutionRole`, {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
            Action: ['sts:AssumeRole'],
          },
        ],
      },
      managedPolicyArns: ['arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'],
      inlinePolicies: props.secrets && {
        secrets: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['secretsmanager:GetSecretValue'],
              Resource: Object.values(props.secrets),
            },
          ],
        },
      },
    })

    const logs = yield* AWS.Logs.LogGroup(`${id}Logs`, { retention: '30 days' })

    return yield* AWS.ECS.TaskDefinition(id, {
      cpu: 256,
      memory: 512,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      runtimePlatform: arm64,
      executionRoleArn: role,
      containerDefinitions: [
        {
          name: id.toLowerCase(),
          image: props.image,
          essential: true,
          command: props.command,
          environment: Object.entries(props.environment).map(([name, value]) => ({ name, value })),
          secrets: Object.entries(props.secrets ?? {}).map(([name, valueFrom]) => ({
            name,
            valueFrom,
          })),
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logs.logGroupName,
              'awslogs-region': region,
              'awslogs-stream-prefix': id.toLowerCase(),
            },
          },
        },
      ],
    })
  })

// Creates the `monospace` and `crm` Postgres users and databases, and keeps their passwords in
// sync with the secrets. Runs before any service on a stage's first deploy.
const dbInitSql = `
SELECT format('CREATE ROLE %I LOGIN', name) FROM (VALUES ('monospace'), ('crm')) AS roles(name)
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = name) \\gexec
ALTER ROLE monospace PASSWORD :'monospace_password';
ALTER ROLE crm PASSWORD :'crm_password';
GRANT monospace, crm TO CURRENT_USER;
ALTER DATABASE monospace OWNER TO monospace;
SELECT 'CREATE DATABASE crm OWNER crm'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm') \\gexec
`

export const DbInit = (data: Effect.Success<ReturnType<typeof Data>>) =>
  OneOffTask('DbInit', {
    image: 'public.ecr.aws/docker/library/postgres:17-alpine',
    command: [
      'sh',
      '-c',
      `psql -v ON_ERROR_STOP=1 -v monospace_password="$MONOSPACE_PASSWORD" -v crm_password="$CRM_PASSWORD" <<'SQL'${dbInitSql}SQL`,
    ],
    environment: {
      PGHOST: data.postgres.endpointAddress,
      PGPORT: String(ports.postgres),
      PGUSER: data.postgresAdmin.username,
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    },
    secrets: {
      PGPASSWORD: data.postgresAdmin.secret.secretArn,
      MONOSPACE_PASSWORD: data.monospaceDb.secret.secretArn,
      CRM_PASSWORD: data.crmDb.secret.secretArn,
    },
  })

// Loads the CRM and portal schemas (and demo data on stages that seed), creates the portal's
// read-only user, and runs `pnpm setup:all` against Monospace. See infra/setup/run.sh.
export const Setup = (
  config: StageConfig,
  url: Output.Output<string>,
  data: Effect.Success<ReturnType<typeof Data>>,
  secrets: Effect.Success<ReturnType<typeof Secrets>>,
  mailpitUrl: string | undefined,
) =>
  Effect.gen(function* () {
    const credentials = z
      .array(z.object({ demoUserCredential: z.string().optional() }))
      .parse(piecesModule.readPieces())
      .flatMap(({ demoUserCredential }) => (demoUserCredential ? [demoUserCredential] : []))

    if (credentials.length > 1) throw new Error('Setup supports one shared demo-user credential')

    const demoUsers =
      mailpitUrl && credentials[0] ? yield* Credential(credentials[0], 'Demo users') : undefined

    const image = yield* AWS.ECR.Image('SetupImage', {
      context: repoRoot,
      dockerfile: 'infra/setup/Dockerfile',
      platform: 'linux/arm64',
    })

    const baseEnvironment = {
      SEED_DEMO_DATA: String(config.seedDemoData),
      DB_SSL_MODE: 'require',
      DB_ADMIN_USER: data.postgresAdmin.username,
      CRM_DB_HOST: data.postgres.endpointAddress,
      CRM_DB_NAME: 'crm',
      CRM_DB_USER: data.crmDb.username,
      MONOSPACE_URL: url,
      MONOSPACE_ADMIN_EMAIL: 'admin@example.com',
      // Stripe's connector isn't installed on AWS: nothing builds it into the Monospace task.
      OPTIONAL_SOURCES: data.portalMysql ? 'portal' : '',
    }

    const environment = mailpitUrl
      ? { ...baseEnvironment, MAILPIT_URL: mailpitUrl }
      : baseEnvironment

    const baseSecrets = {
      POSTGRES_ADMIN_PASSWORD: data.postgresAdmin.secret.secretArn,
      CRM_DB_PASSWORD: data.crmDb.secret.secretArn,
      MONOSPACE_ADMIN_PASSWORD: secrets.admin.secret.secretArn,
    }

    const setupSecrets = demoUsers
      ? { ...baseSecrets, DEMO_USER_PASSWORD: demoUsers.secret.secretArn }
      : baseSecrets

    return yield* OneOffTask('Setup', {
      image: image.imageUri,
      environment: data.portalMysql
        ? {
            ...environment,
            CUSTOMER_MYSQL_HOST: data.portalMysql.endpointAddress,
            PORTAL_DEMO_DATABASE: '1',
          }
        : environment,
      secrets:
        data.mysqlAdmin && data.portalReader
          ? {
              ...setupSecrets,
              MYSQL_ADMIN_PASSWORD: data.mysqlAdmin.secret.secretArn,
              PORTAL_READER_PASSWORD: data.portalReader.secret.secretArn,
            }
          : setupSecrets,
    })
  })
