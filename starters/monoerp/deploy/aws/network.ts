import * as AWS from 'alchemy/AWS'
import * as Effect from 'effect/Effect'

import type { StageConfig } from './stages.ts'

export const ports = { postgres: 5432, mysql: 3306, valkey: 6379, amqps: 5671 }

export const servicePorts = { monospace: 8100, app: 3000, amqp: 5672, smtp: 1025, mailpit: 8025 }

// AWS-managed list of CloudFront's origin-facing IPs, per region. Find another region's with
// `aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing`.
const cloudfrontPrefixLists = new Map([['us-east-1', 'pl-3b927c52']])

// Public subnets hold the load balancer and NAT. Everything else runs in private subnets
// and reaches the internet (licensing, SES, image pulls) through the NAT.
export const Network = (config: StageConfig) =>
  Effect.gen(function* () {
    const vpc = yield* AWS.EC2.Network('Network', {
      cidrBlock: '10.40.0.0/16',
      availabilityZones: 2,
      nat: config.nat,
      gatewayEndpoints: ['s3'],
    })

    // The load balancer only takes traffic from CloudFront, which serves the public HTTPS URL.
    const alb = yield* AWS.EC2.SecurityGroup('AlbSecurityGroup', {
      vpcId: vpc.vpcId,
      description: 'HTTP from CloudFront to the load balancer',
      ingress: [
        {
          ipProtocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          prefixListId: cloudfrontPrefixLists.get(process.env.AWS_REGION ?? 'us-east-1'),
        },
      ],
    })

    // Every ECS task (Monospace, the app, setup, the probe) joins this group. It takes
    // traffic from the load balancer, plus AMQP and mail between staging's tasks.
    const tasks = yield* AWS.EC2.SecurityGroup('TasksSecurityGroup', {
      vpcId: vpc.vpcId,
      description: 'ECS tasks',
      ingress: [servicePorts.monospace, servicePorts.app].map((port) => ({
        ipProtocol: 'tcp',
        fromPort: port,
        toPort: port,
        referencedGroupId: alb.groupId,
        description: `${port} from the load balancer`,
      })),
    })

    yield* AWS.EC2.SecurityGroupRule('TasksAmqpIngress', {
      groupId: tasks.groupId,
      type: 'ingress',
      ipProtocol: 'tcp',
      fromPort: servicePorts.amqp,
      toPort: servicePorts.amqp,
      referencedGroupId: tasks.groupId,
      description: 'AMQP between tasks',
    })

    // Staging's Mailpit: SMTP from Monospace, and its API for the setup task.
    if (config.mailCatcher) {
      for (const [id, port] of [
        ['TasksSmtpIngress', servicePorts.smtp],
        ['TasksMailpitIngress', servicePorts.mailpit],
      ] as const) {
        yield* AWS.EC2.SecurityGroupRule(id, {
          groupId: tasks.groupId,
          type: 'ingress',
          ipProtocol: 'tcp',
          fromPort: port,
          toPort: port,
          referencedGroupId: tasks.groupId,
          description: 'Mailpit between tasks',
        })
      }
    }

    // Data stores only accept connections from tasks, on their own port.
    const data = yield* AWS.EC2.SecurityGroup('DataSecurityGroup', {
      vpcId: vpc.vpcId,
      description: 'Postgres, MySQL, Valkey, and RabbitMQ, reachable from ECS tasks only',
      ingress: Object.entries(ports).map(([name, port]) => ({
        ipProtocol: 'tcp',
        fromPort: port,
        toPort: port,
        referencedGroupId: tasks.groupId,
        description: `${name} from ECS tasks`,
      })),
    })

    return { vpc, alb, tasks, data }
  })

export type Network = Effect.Success<ReturnType<typeof Network>>
