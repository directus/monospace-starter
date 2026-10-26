import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'

const directories = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'monoerp-portal-provision-'))
  directories.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'mysql'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
cat >> "$SQL_LOG"
case "$*" in *'SELECT COUNT'*) printf '1\\n' ;; esac
`,
    { mode: 0o755 },
  )

  return {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    CALL_LOG: join(root, 'calls'),
    SQL_LOG: join(root, 'sql'),
    CUSTOMER_MYSQL_HOST: 'external.example',
    MYSQL_ADMIN_PASSWORD: 'fixture',
    PORTAL_READER_PASSWORD: 'fixture',
    DB_ADMIN_USER: 'admin',
    SEED_DEMO_DATA: 'false',
    PORTAL_DEMO_DATABASE: '',
  }
}

function provision(env) {
  execFileSync('sh', [fileURLToPath(new URL('./emulator/provision.sh', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true })
})

it('does not connect to a supplied host without the explicit demo flag', () => {
  const env = fixture()
  provision(env)
  expect(existsSync(env.CALL_LOG)).toBe(false)
})

it('only provisions an explicitly selected demo and never drops its database', () => {
  const env = { ...fixture(), PORTAL_DEMO_DATABASE: '1' }
  provision(env)
  expect(readFileSync(env.CALL_LOG, 'utf8')).toContain(
    'CREATE DATABASE IF NOT EXISTS customer_portal',
  )
  expect(readFileSync(env.CALL_LOG, 'utf8')).not.toContain('DROP DATABASE')
  expect(readFileSync(env.SQL_LOG, 'utf8')).toContain('GRANT SELECT ON customer_portal.*')
})
