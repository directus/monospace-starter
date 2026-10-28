import * as AWS from 'alchemy/AWS'
import * as Output from 'alchemy/Output'
import * as Effect from 'effect/Effect'

import type { Data } from './data.ts'
import { envValue } from './secrets.ts'
import type { Services } from './services.ts'
import type { StageConfig } from './stages.ts'

// Shared by both CloudFront distributions. CloudFront-scoped rules must live in us-east-1.
export const Firewall = (config: StageConfig) =>
  AWS.WAFv2.WebACL('Firewall', {
    scope: 'CLOUDFRONT',
    description: 'AWS managed protections and a per-IP rate limit for monoERP and Studio',
    defaultAction: { Allow: {} },
    rules: [
      managedRules('AWSManagedRulesAmazonIpReputationList', 0),
      // Count, don't block: attachments go past the 8 KB body limit, notes hold HTML, and
      // Monospace reads put every field and include in the URL, past the 2 KB query limit.
      managedRules('AWSManagedRulesCommonRuleSet', 1, [
        'SizeRestrictions_QUERYSTRING',
        'SizeRestrictions_BODY',
        'CrossSiteScripting_BODY',
      ]),
      managedRules('AWSManagedRulesKnownBadInputsRuleSet', 2),
      {
        Name: 'RateLimitPerIp',
        Priority: 3,
        Statement: { RateBasedStatement: { Limit: config.rateLimitPerIp, AggregateKeyType: 'IP' } },
        Action: { Block: {} },
        VisibilityConfig: visibility('RateLimitPerIp'),
      },
    ],
    visibilityConfig: visibility('Firewall'),
  })

const visibility = (name: string) => ({
  SampledRequestsEnabled: true,
  CloudWatchMetricsEnabled: true,
  MetricName: name,
})

const managedRules = (name: string, priority: number, countOnly: string[] = []) => ({
  Name: name,
  Priority: priority,
  Statement: {
    ManagedRuleGroupStatement: {
      VendorName: 'AWS',
      Name: name,
      RuleActionOverrides: countOnly.map((rule) => ({ Name: rule, ActionToUse: { Count: {} } })),
    },
  },
  OverrideAction: { None: {} },
  VisibilityConfig: visibility(name),
})

// Monospace tasks handled about 200 requests a second each in load tests before requests
// queued, whatever their CPU. Scale out at half that, measured as load balancer requests
// per task per minute.
const requestsPerTaskPerMinute = 6_000

export const Operations = (
  stage: string,
  config: StageConfig,
  cluster: AWS.ECS.Cluster,
  services: Effect.Success<ReturnType<typeof Services>>,
  data: Effect.Success<ReturnType<typeof Data>>,
) =>
  Effect.gen(function* () {
    const { monospace, app, loadBalancerArn } = services

    // Alarms go to ALARM_EMAIL (environment or the repo's .env). AWS emails a confirmation link
    // first; nothing arrives until it's clicked.
    const topic = yield* AWS.SNS.Topic('Alarms', {})
    const email = envValue('ALARM_EMAIL')

    if (email) {
      yield* AWS.SNS.Subscription('AlarmEmail', {
        topicArn: topic.topicArn,
        protocol: 'email',
        endpoint: email,
      })
    }

    // CloudWatch names load balancers and target groups by the tail of their ARNs.
    const lb = Output.map(loadBalancerArn, (arn) => arn.split(':loadbalancer/')[1])

    const targetGroup = (arn: Output.Output<string | undefined>) =>
      Output.map(arn, (value) => (value ?? '').split(':')[5])

    const monospaceTarget = targetGroup(monospace.targetGroupArn)
    const appTarget = targetGroup(app.targetGroupArn)

    // The name is the email subject and the description is the first line of the body, so both
    // say what's wrong and where to look.
    const alarm = (
      id: string,
      title: string,
      whatToDo: string,
      metric: {
        namespace: string
        name: string
        dimensions: Record<string, string | Output.Output<string>>
        stat: string
        comparison: 'GreaterThanThreshold' | 'LessThanThreshold'
        threshold: number
        minutes?: number
        missing?: 'breaching' | 'notBreaching'
      },
    ) =>
      AWS.CloudWatch.Alarm(id, {
        name: `monoERP ${stage}: ${title}`,
        AlarmDescription: whatToDo,
        Namespace: metric.namespace,
        MetricName: metric.name,
        Dimensions: Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value })),
        ...(metric.stat.startsWith('p')
          ? { ExtendedStatistic: metric.stat }
          : { Statistic: metric.stat }),
        Period: 60,
        EvaluationPeriods: metric.minutes ?? 3,
        Threshold: metric.threshold,
        ComparisonOperator: metric.comparison,
        TreatMissingData: metric.missing ?? 'notBreaching',
        AlarmActions: [topic.topicArn],
        OKActions: [topic.topicArn],
      })

    const alb = 'AWS/ApplicationELB'
    yield* alarm(
      'MonospaceUnhealthy',
      'Monospace has fewer healthy tasks than it needs',
      'Tasks are failing health checks or crash-looping. Check the Monospace log group in CloudWatch and the ECS service events, then any recent deploy.',
      {
        namespace: alb,
        name: 'HealthyHostCount',
        dimensions: { LoadBalancer: lb, TargetGroup: monospaceTarget },
        stat: 'Minimum',
        comparison: 'LessThanThreshold',
        threshold: config.monospace.count,
        missing: 'breaching',
      },
    )
    yield* alarm(
      'AppDown',
      'The monoERP app is down',
      'No app task is passing health checks, so monoERP shows errors. Check the app log group in CloudWatch and the ECS service events.',
      {
        namespace: alb,
        name: 'HealthyHostCount',
        dimensions: { LoadBalancer: lb, TargetGroup: appTarget },
        stat: 'Minimum',
        comparison: 'LessThanThreshold',
        threshold: 1,
        missing: 'breaching',
      },
    )
    yield* alarm(
      'MonospaceErrors',
      'Monospace is returning server errors',
      'More than 10 5xx responses a minute for 3 minutes. Check the Monospace log group for errors; database connection errors point at the database alarms.',
      {
        namespace: alb,
        name: 'HTTPCode_Target_5XX_Count',
        dimensions: { LoadBalancer: lb, TargetGroup: monospaceTarget },
        stat: 'Sum',
        comparison: 'GreaterThanThreshold',
        threshold: 10,
      },
    )
    // 502/503/504 from the load balancer itself: no healthy target, or targets timing out.
    yield* alarm(
      'LoadBalancerErrors',
      'The load balancer is returning errors',
      'The load balancer answered 502, 503, or 504: no healthy task, or tasks too slow to reply. Check the healthy task alarms and the ECS service events.',
      {
        namespace: alb,
        name: 'HTTPCode_ELB_5XX_Count',
        dimensions: { LoadBalancer: lb },
        stat: 'Sum',
        comparison: 'GreaterThanThreshold',
        threshold: 10,
      },
    )
    yield* alarm(
      'MonospaceSlow',
      'Monospace is slow',
      'The slowest 5% of API requests took over 1 second for 5 minutes. Usually load: check whether autoscaling added tasks, and the Postgres CPU alarm.',
      {
        namespace: alb,
        name: 'TargetResponseTime',
        dimensions: { LoadBalancer: lb, TargetGroup: monospaceTarget },
        stat: 'p95',
        comparison: 'GreaterThanThreshold',
        threshold: 1,
        minutes: 5,
      },
    )

    const postgres = { DBInstanceIdentifier: data.postgres.dbInstanceIdentifier }
    yield* alarm(
      'PostgresCpu',
      'Postgres CPU is high',
      'Postgres CPU over 80% for 10 minutes. If it persists, move to a larger instance class in deploy/aws/stages.ts.',
      {
        namespace: 'AWS/RDS',
        name: 'CPUUtilization',
        dimensions: postgres,
        stat: 'Average',
        comparison: 'GreaterThanThreshold',
        threshold: 80,
        minutes: 10,
      },
    )

    // Burstable instances slow to their baseline, or bill surplus credits, once this runs out.
    if (config.postgres.instanceClass.startsWith('db.t')) {
      yield* alarm(
        'PostgresCredits',
        'Postgres is running out of CPU credits',
        'The burstable instance has used its CPU credits and now bills extra for sustained load. Move to a larger or non-burstable class in deploy/aws/stages.ts.',
        {
          namespace: 'AWS/RDS',
          name: 'CPUCreditBalance',
          dimensions: postgres,
          stat: 'Minimum',
          comparison: 'LessThanThreshold',
          threshold: 20,
          minutes: 10,
        },
      )
    }

    yield* alarm(
      'PostgresStorage',
      'Postgres is running out of disk',
      'Less than 10% of Postgres storage is free. Storage autoscaling may be at its cap; raise storageGb in deploy/aws/stages.ts.',
      {
        namespace: 'AWS/RDS',
        name: 'FreeStorageSpace',
        dimensions: postgres,
        stat: 'Minimum',
        comparison: 'LessThanThreshold',
        threshold: config.postgres.storageGb * 0.1 * 1024 ** 3,
      },
    )

    // Metrics are per node; -001 is the primary unless a failover moved it.
    const valkey = {
      CacheClusterId: Output.interpolate`${data.valkey.replicationGroupId}-001`,
    }

    yield* alarm(
      'ValkeyMemory',
      'The Valkey cache is nearly full',
      'Valkey memory over 80%. It evicts old cache entries, so this is slowness, not an outage. Move to a larger node type in deploy/aws/stages.ts.',
      {
        namespace: 'AWS/ElastiCache',
        name: 'DatabaseMemoryUsagePercentage',
        dimensions: valkey,
        stat: 'Maximum',
        comparison: 'GreaterThanThreshold',
        threshold: 80,
      },
    )

    // Monospace scales on requests per task: the load test showed CPU staying near 50% while
    // requests queue, so a CPU target would never fire. Deploys reset the count to the minimum.
    const resourceId = Output.interpolate`service/${cluster.clusterName}/${monospace.serviceName}`

    const scaling = {
      serviceNamespace: 'ecs',
      resourceId,
      scalableDimension: 'ecs:service:DesiredCount',
    } as const

    yield* AWS.ApplicationAutoScaling.ScalableTarget('MonospaceScaling', {
      ...scaling,
      minCapacity: config.monospace.count,
      maxCapacity: config.monospace.maxCount,
    })
    yield* AWS.ApplicationAutoScaling.ScalingPolicy('MonospaceRequestScaling', {
      ...scaling,
      targetTracking: {
        TargetValue: requestsPerTaskPerMinute,
        PredefinedMetricSpecification: {
          PredefinedMetricType: 'ALBRequestCountPerTarget',
          ResourceLabel: Output.interpolate`${lb}/${monospaceTarget}`,
        },
        ScaleOutCooldown: 60,
        ScaleInCooldown: 300,
      },
    })

    return { alarmTopicArn: topic.topicArn }
  })
