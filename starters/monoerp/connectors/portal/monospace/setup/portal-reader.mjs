// The read-only login Monospace connects as, in this folder's Compose MySQL. Runs on every
// setup, so a database created without it (or with an old password) is repaired. Hosted and
// external servers manage their own login (AWS: emulator/provision.sh).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { connectors } from '../../../../infra/monospace/setup/installed.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

const host = process.env.CUSTOMER_MYSQL_HOST || 'customer-mysql'

if (host !== 'customer-mysql') {
  console.log(`Skipped: Portal uses ${host}, which manages its own login`)
} else if (!composeMysql()) {
  console.log('Skipped: no customer-mysql container in this folder')
} else {
  const { user } = connectors.find((connector) => connector.id === 'portal').source
  const password = sqlString(process.env.PORTAL_READER_PASSWORD || 'monospace')

  execFileSync(
    'docker',
    ['compose', 'exec', '-T', '-e', 'MYSQL_PWD', 'customer-mysql', 'mysql', '-uroot'],
    {
      cwd: root,
      env: { ...process.env, MYSQL_PWD: process.env.CUSTOMER_MYSQL_ROOT_PASSWORD || 'monospace' },
      input: `CREATE USER IF NOT EXISTS ${sqlString(user)}@'%' IDENTIFIED BY ${password};
ALTER USER ${sqlString(user)}@'%' IDENTIFIED BY ${password};
GRANT SELECT ON customer_portal.* TO ${sqlString(user)}@'%';
`,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  )
  console.log(`${user} can read customer_portal`)
}

function composeMysql() {
  try {
    return execFileSync('docker', ['compose', 'ps', '-q', 'customer-mysql'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function sqlString(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
}
