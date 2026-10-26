import * as AWS from 'alchemy/AWS'
import * as Output from 'alchemy/Output'
import * as RemovalPolicy from 'alchemy/RemovalPolicy'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import type { Network } from './network.ts'
import { ports } from './network.ts'
import { Credential } from './secrets.ts'
import type { StageConfig } from './stages.ts'

export const Data = (config: StageConfig, { vpc, data }: Network) =>
  Effect.gen(function* () {
    const subnets = yield* AWS.RDS.DBSubnetGroup('DatabaseSubnets', {
      description: 'Private subnets for RDS',
      subnetIds: vpc.privateSubnetIds,
    })

    // Admin passwords live in our own secrets rather than RDS-managed JSON ones, so the setup
    // task can read them as plain values.
    const database = {
      dbSubnetGroupName: subnets.dbSubnetGroupName,
      vpcSecurityGroupIds: [data.groupId],
      publiclyAccessible: false,
      storageType: 'gp3',
      storageEncrypted: true,
      manageMasterUserPassword: false,
      backupRetentionPeriod: Duration.days(config.backupDays),
      copyTagsToSnapshot: true,
      deletionProtection: config.retain,
      skipFinalSnapshot: !config.retain,
    }

    // One instance, two databases: `monospace` (system) here, and `crm`, which the setup task
    // creates along with each database's own user.
    const postgresAdmin = yield* Credential('PostgresAdminCredentials', 'admin_user')

    const postgres = yield* AWS.RDS.DBInstance('Postgres', {
      ...database,
      masterUsername: postgresAdmin.username,
      masterUserPassword: postgresAdmin.password,
      engine: 'postgres',
      engineVersion: '17.11',
      dbInstanceClass: config.postgres.instanceClass,
      multiAZ: config.postgres.multiAz,
      allocatedStorage: config.postgres.storageGb,
      maxAllocatedStorage: config.postgres.storageGb * 5,
      port: ports.postgres,
      dbName: 'monospace',
      finalDBSnapshotIdentifier: config.retain ? 'crm-postgres-final' : undefined,
    }).pipe(RemovalPolicy.retain(config.retain))

    const monospaceDb = yield* Credential('MonospaceDbCredentials', 'monospace')
    const crmDb = yield* Credential('CrmDbCredentials', 'crm')

    const mysqlAdmin = config.portalMysql
      ? yield* Credential('MysqlAdminCredentials', 'admin_user')
      : undefined

    const portalMysql =
      config.portalMysql && mysqlAdmin
        ? yield* AWS.RDS.DBInstance('PortalMysql', {
            ...database,
            masterUsername: mysqlAdmin.username,
            masterUserPassword: mysqlAdmin.password,
            engine: 'mysql',
            engineVersion: '8.4.11',
            dbInstanceClass: config.portalMysql.instanceClass,
            allocatedStorage: config.portalMysql.storageGb,
            port: ports.mysql,
            dbName: 'customer_portal',
            // Reloadable demo data, so no protection or final snapshot even on prod. Backups
            // also turn on binary logging, which blocks the seed's helper functions for a
            // non-SUPER admin.
            backupRetentionPeriod: Duration.zero,
            deletionProtection: false,
            skipFinalSnapshot: true,
          })
        : undefined

    const portalReader = portalMysql
      ? yield* Credential('PortalReaderCredentials', 'monospace_reader')
      : undefined

    const cacheSubnets = yield* AWS.ElastiCache.SubnetGroup('CacheSubnets', {
      description: 'Private subnets for Valkey',
      subnetIds: vpc.privateSubnetIds,
    })

    const valkey = yield* AWS.ElastiCache.ReplicationGroup('Valkey', {
      description: 'Monospace query cache',
      engine: 'valkey',
      engineVersion: '9.1',
      nodeType: config.valkey.nodeType,
      replicasPerNodeGroup: config.valkey.replicas,
      automaticFailoverEnabled: config.valkey.replicas > 0,
      multiAzEnabled: config.valkey.replicas > 0,
      subnetGroupName: cacheSubnets.subnetGroupName,
      securityGroupIds: [data.groupId],
      port: ports.valkey,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
    })

    const rabbitmq = yield* Credential('RabbitmqCredentials', 'monospace')

    const broker = config.broker
      ? yield* AWS.MQ.Broker('Broker', {
          engineType: 'RABBITMQ',
          engineVersion: '3.13',
          hostInstanceType: config.broker.instanceType,
          deploymentMode: config.broker.mode,
          // A single broker lives in one subnet; a cluster spans them.
          subnetIds:
            config.broker.mode === 'SINGLE_INSTANCE'
              ? [vpc.privateSubnetIds[0]]
              : vpc.privateSubnetIds,
          securityGroups: [data.groupId],
          publiclyAccessible: false,
          users: [{ username: rabbitmq.username, password: rabbitmq.password }],
        })
      : undefined

    const assets = yield* AWS.S3.Bucket('Assets', {
      versioning: 'Enabled',
      encryption: { sseAlgorithm: 'AES256' },
      publicAccessBlock: {
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
      objectOwnership: 'BucketOwnerEnforced',
      lifecycleRules: [
        {
          ID: 'expire-old-versions',
          Status: 'Enabled',
          Filter: {},
          NoncurrentVersionExpiration: { NoncurrentDays: 30 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
        },
      ],
      forceDestroy: !config.retain,
    }).pipe(RemovalPolicy.retain(config.retain))

    // Monospace's S3 connector ignores the task role and needs static keys, so it gets a
    // user limited to this one bucket.
    const assetsUser = yield* AWS.IAM.User('AssetsUser', {
      inlinePolicies: {
        assets: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['s3:ListBucket'],
              Resource: [assets.bucketArn],
            },
            {
              Effect: 'Allow',
              Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
              Resource: [Output.interpolate`${assets.bucketArn}/*`],
            },
          ],
        },
      },
    })

    const assetsKey = yield* AWS.IAM.AccessKey('AssetsAccessKey', {
      userName: assetsUser.userName,
    })

    const assetsSecretKey = yield* AWS.SecretsManager.Secret('AssetsSecretKey', {
      description: 'S3 secret access key for Monospace assets',
      secretString: assetsKey.secretAccessKey,
    })

    return {
      postgres,
      postgresAdmin,
      monospaceDb,
      crmDb,
      portalMysql,
      mysqlAdmin,
      portalReader,
      valkey,
      broker,
      rabbitmq,
      assets,
      assetsAccessKeyId: assetsKey.accessKeyId,
      assetsSecretKey,
    }
  })
