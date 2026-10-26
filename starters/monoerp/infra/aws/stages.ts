import { existsSync } from 'node:fs'

// Sizing per stage. Scaling lean prod is one line here, then `pnpm aws:deploy --stage prod`.
export interface StageConfig {
  nat: 'single' | 'per-az'
  postgres: { instanceClass: string; multiAz: boolean; storageGb: number }
  // Stand-in for another team's database. Prod connects to existing databases instead.
  portalMysql?: { instanceClass: string; storageGb: number }
  valkey: { nodeType: `cache.${string}`; replicas: number }
  // Staging runs RabbitMQ as a Fargate task, so no managed broker is needed.
  broker?: { instanceType: string; mode: 'SINGLE_INSTANCE' | 'CLUSTER_MULTI_AZ' }
  // Fargate sizes: cpu in units (1024 = 1 vCPU), memory in MB. Monospace autoscales from
  // count to maxCount.
  monospace: { cpu: number; memory: number; count: number; maxCount: number }
  app: { cpu: number; memory: number; count: number }
  backupDays: number
  // Load the demo fixtures into empty databases. Prod starts empty.
  seedDemoData: boolean
  // Adds a Cache-Status header (hit, miss, bypass) to API responses. Off by default upstream
  // because it reveals cache behavior.
  cacheStatusHeader: boolean
  // Runs Mailpit as Monospace's mail server, reachable only inside the network, so invites
  // and password resets work. Prod needs real email instead.
  mailCatcher: boolean
  // Requests per client IP per 5 minutes before the WAF blocks it. The app fires several API
  // calls per screen, and a room on one Wi-Fi shares an IP.
  rateLimitPerIp: number
  // Keep databases, the bucket, and key material when the stack is destroyed.
  retain: boolean
}

const staging: StageConfig = {
  nat: 'single',
  postgres: { instanceClass: 'db.t4g.micro', multiAz: false, storageGb: 20 },
  portalMysql: { instanceClass: 'db.t4g.micro', storageGb: 20 },
  valkey: { nodeType: 'cache.t4g.micro', replicas: 0 },
  monospace: { cpu: 512, memory: 1024, count: 2, maxCount: 3 },
  app: { cpu: 256, memory: 512, count: 1 },
  backupDays: 1,
  seedDemoData: true,
  cacheStatusHeader: true,
  mailCatcher: true,
  // Room for a live demo: people on one shared office network.
  rateLimitPerIp: 50_000,
  retain: false,
}

const prod: StageConfig = {
  nat: 'single',
  postgres: { instanceClass: 'db.t4g.small', multiAz: true, storageGb: 20 },
  // Demo database only. For a real Portal source, remove portalMysql and configure the
  // source host separately; never pass a real database to demo provisioning.
  portalMysql: { instanceClass: 'db.t4g.micro', storageGb: 20 },
  valkey: { nodeType: 'cache.t4g.micro', replicas: 1 },
  broker: { instanceType: 'mq.m7g.medium', mode: 'SINGLE_INSTANCE' },
  monospace: { cpu: 1024, memory: 2048, count: 2, maxCount: 4 },
  app: { cpu: 256, memory: 512, count: 1 },
  backupDays: 14,
  seedDemoData: false,
  cacheStatusHeader: false,
  mailCatcher: false,
  rateLimitPerIp: 10_000,
  retain: true,
}

const stages = new Map(Object.entries({ staging, prod }))

export const stageConfig = (stage: string) => {
  const config = stages.get(stage)

  if (!config)
    throw new Error(`Unknown stage "${stage}". Use one of: ${[...stages.keys()].join(', ')}`)

  return {
    ...config,
    portalMysql: existsSync(new URL('../../connectors/portal/connector.json', import.meta.url))
      ? config.portalMysql
      : undefined,
  }
}
