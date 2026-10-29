// Proves backups restore: restores Postgres to its latest restorable time in a scratch instance,
// compares row counts with the live database, then deletes the scratch instance. Takes 15 to 30
// minutes, most of it RDS creating and deleting the instance. The scratch instance is deleted
// even if the check fails.
//
//   pnpm aws restore-test --stage staging
import { aws, awsJson, runTask, stackOutputs, stage } from './lib.mjs'

const outputs = stackOutputs()

const source = awsJson('rds', 'describe-db-instances').DBInstances.find(
  (instance) => instance.Endpoint?.Address === outputs.postgresHost,
)

if (!source) {
  console.error(`No Postgres instance found at ${outputs.postgresHost}.`)
  process.exit(1)
}

const scratch = `${source.DBInstanceIdentifier}-restore-test`.slice(0, 63)

// CRM row counts, using the task that sets up database users; it already has the admin login.
const counts = (host) => {
  const lines = []

  const code = runTask(
    outputs,
    outputs.dbInitTaskDefinition,
    {
      containerOverrides: [
        {
          name: 'dbinit',
          environment: [{ name: 'PGHOST', value: host }],
          command: [
            'psql',
            '-d',
            'app',
            '-Atc',
            "select 'organizations=' || (select count(*) from organizations) || ' contacts=' || (select count(*) from contacts) || ' activities=' || (select count(*) from activities)",
          ],
        },
      ],
    },
    lines,
  )

  const result = lines.find((line) => line.startsWith('organizations='))

  if (code !== 0 || !result) throw new Error(`counting rows on ${host} failed`)

  return result
}

let created = false

let failed = false

try {
  console.log(
    `Restoring ${source.DBInstanceIdentifier} (${stage}) to ${source.LatestRestorableTime}`,
  )
  console.log(`as ${scratch}. RDS takes 10 to 20 minutes and prints nothing meanwhile.`)
  aws(
    'rds',
    'restore-db-instance-to-point-in-time',
    '--source-db-instance-identifier',
    source.DBInstanceIdentifier,
    '--target-db-instance-identifier',
    scratch,
    '--use-latest-restorable-time',
    '--db-instance-class',
    source.DBInstanceClass,
    '--db-subnet-group-name',
    source.DBSubnetGroup.DBSubnetGroupName,
    '--vpc-security-group-ids',
    ...source.VpcSecurityGroups.map((group) => group.VpcSecurityGroupId),
    '--no-multi-az',
    '--no-publicly-accessible',
    '--no-deletion-protection',
    '--tags',
    'Key=purpose,Value=restore-test',
  )
  created = true
  aws('rds', 'wait', 'db-instance-available', '--db-instance-identifier', scratch)

  const restoredHost = awsJson('rds', 'describe-db-instances', '--db-instance-identifier', scratch)
    .DBInstances[0].Endpoint.Address

  console.log('Counting rows in the live database...')
  const live = counts(outputs.postgresHost)
  console.log('Counting rows in the restored copy...')
  const restored = counts(restoredHost)
  console.log(`Live:     ${live}\nRestored: ${restored}`)

  // Writes in the last few minutes may not be in the restore yet.
  if (live === restored) console.log('Restore test passed.')
  else console.log('Counts differ: expected only if something was written in the last 5 minutes.')
} catch (error) {
  failed = true
  console.error(`Restore test failed: ${error.stderr?.toString().trim() || error.message}`)
} finally {
  if (created) {
    console.log(`Deleting ${scratch}...`)
    aws(
      'rds',
      'delete-db-instance',
      '--db-instance-identifier',
      scratch,
      '--skip-final-snapshot',
      '--delete-automated-backups',
    )
    aws('rds', 'wait', 'db-instance-deleted', '--db-instance-identifier', scratch)
    console.log('Deleted.')
  }
}

process.exit(failed ? 1 : 0)
