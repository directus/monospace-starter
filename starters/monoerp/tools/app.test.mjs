import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'

import { resolveSource } from '../infra/manifests.mjs'
import { checkApp, removeInstalled } from './app.mjs'
import { manifestDocument } from './manifest-fixtures.mjs'

const directories = []

function write(root, path, value = '') {
  const url = new URL(path, root)
  mkdirSync(new URL('./', url), { recursive: true })
  writeFileSync(url, value)
}

function save(root, path, manifest) {
  write(root, path, JSON.stringify(manifestDocument(manifest)))
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'monoerp-removal-'))
  directories.push(directory)
  execFileSync('git', ['init', '--quiet'], { cwd: directory })
  const root = pathToFileURL(`${directory}/`)
  save(root, 'starter.json', {
    kind: 'starter',
    id: 'starter',
    label: 'Core',
    description: 'Shared',
    ownedPaths: ['starter.json'],
    requires: [],
    optional: [],
  })

  const manifest = {
    kind: 'module',
    id: 'sales',
    label: 'Sales',
    description: 'Sales',
    order: 10,
    ownedPaths: [
      'modules/sales',
      'apps/web/src/modules/sales',
      'infra/modules/sales',
      'apps/web/src/routes/sales.tsx',
    ],
    requires: [],
    optional: ['billing'],
    app: 'apps/web/src/modules/sales',
    infra: 'infra/modules/sales',
    settings: [],
    collections: ['organizations'],
    schemas: ['organizations'],
    schemaFiles: [],
    auditTables: {},
    setup: { beforeSchema: [], afterSchema: [] },
  }

  save(root, 'modules/sales/module.json', manifest)
  write(root, 'apps/web/src/modules/sales/module.ts')
  write(root, 'infra/modules/sales/schema.sql')
  write(root, 'apps/web/src/routes/sales.tsx')

  return { root, manifest }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('previews without writes, then removes only declared paths and leaves a valid starter', () => {
  const { root, manifest } = fixture()
  write(root, 'keep.txt', 'keep')
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(manifest.ownedPaths)
  expect(existsSync(new URL('modules/sales/module.json', root))).toBe(true)
  removeInstalled('sales', { root })
  expect(manifest.ownedPaths.every((path) => !existsSync(new URL(path, root)))).toBe(true)
  expect(readFileSync(new URL('keep.txt', root), 'utf8')).toBe('keep')
  expect(checkApp(root).map((manifest) => manifest.id)).toEqual(['starter'])
})

it('refuses removal of required modules and connectors, starter, and unknown ids before writing', () => {
  const { root, manifest } = fixture()
  manifest.requires = ['starter']
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('starter', { root })).toThrow('Starter is always installed')
  expect(() => removeInstalled('missing', { root })).toThrow('Unknown module, connector, or add-on')

  const dependency = {
    kind: 'connector',
    id: 'billing',
    label: 'Billing',
    description: 'Billing',
    ownedPaths: ['connectors/billing'],
    requires: [],
    optional: [],

    schemaFiles: [],
    source: { provider: 'demo' },
    setup: { beforeSchema: [], afterSchema: [] },
  }

  save(root, 'connectors/billing/connector.json', dependency)
  manifest.requires = ['billing']
  manifest.optional = []
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('billing', { root })).toThrow('billing is required by sales')
  expect(existsSync(new URL('connectors/billing/connector.json', root))).toBe(true)
})

it('rejects missing dependencies and paths before deleting anything', () => {
  const { root, manifest } = fixture()
  manifest.requires = ['missing']
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow('required manifest missing is absent')
  manifest.requires = []
  manifest.schemaFiles = ['infra/modules/sales/missing.json']
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow(
    'sales: infra/modules/sales/missing.json is listed but missing',
  )
  expect(existsSync(new URL('apps/web/src/routes/sales.tsx', root))).toBe(true)
})

it('rejects overlapping ownership even within a single manifest', () => {
  const { root, manifest } = fixture()
  manifest.ownedPaths.push('apps/web/src/routes')
  save(root, 'modules/sales/module.json', manifest)
  expect(() => checkApp(root)).toThrow('Overlapping ownership')
})

it('finds new unowned source files and ignores generated files', () => {
  const { root } = fixture()
  write(root, '.gitignore', 'infra/modules/sales/generated/\n')
  write(root, 'infra/modules/sales/generated/build.js')
  expect(checkApp(root)).toHaveLength(2)
  write(root, 'apps/web/src/routes/new.tsx')
  expect(() => checkApp(root)).toThrow('new.tsx: expected one owner, found 0')
})

it.each([
  '../escape',
  '/absolute',
  'apps/../escape',
  'apps//web',
  '.git/config',
  'node_modules/demo',
  'apps/%2e%2e/escape',
])('rejects unsafe ownership %s', (path) => {
  const { root, manifest } = fixture()
  manifest.ownedPaths.push(path)
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow()
  expect(existsSync(new URL('modules/sales/module.json', root))).toBe(true)
})

it('refuses symlink ownership and symlink ancestors', () => {
  const { root, manifest } = fixture()
  symlinkSync(fileURLToPath(new URL('apps/web/src/modules/sales/', root)), new URL('linked', root))
  manifest.ownedPaths.push('linked/module.ts')
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow('symlinks cannot be owned or traversed')
})

it('rejects schema drift and references outside owned paths', () => {
  const { root, manifest } = fixture()
  manifest.schemas = ['missing']
  save(root, 'modules/sales/module.json', manifest)
  expect(() => checkApp(root)).toThrow('schemas missing from collections: missing')
  manifest.schemas = []
  manifest.settings = ['starter.json']
  save(root, 'modules/sales/module.json', manifest)
  expect(() => checkApp(root)).toThrow('referenced path is not owned')
})

it('resolves connector defaults and environment branches without changing the manifests', () => {
  const sources = {
    demo: {
      apiName: 'Demo',
      provider: 'monoerp/demo-data-connector',
      config: {
        when: 'DEMO_API_KEY',
        value: {
          apiKey: { env: 'DEMO_API_KEY' },
          environment: { env: 'DEMO_ENVIRONMENT', default: 'staging', emptyUsesDefault: true },
        },
        otherwise: {
          apiKey: 'monoerp_local',
          apiBase: { env: 'DEMO_API_BASE', default: 'http://demo:4020' },
        },
      },
    },
    portal: {
      port: { env: 'CUSTOMER_MYSQL_INTERNAL_PORT', default: 3306 },
      ssl: { when: 'DB_SSL_MODE', value: { mode: { env: 'DB_SSL_MODE' } } },
    },
    stripe: {
      config: {
        apiKey: { env: 'STRIPE_API_KEY', default: 'demo' },
        apiBase: { env: 'STRIPE_API_BASE', default: 'http://stripe:4010' },
      },
    },
  }

  expect(resolveSource(sources.demo, {})).toEqual({
    apiName: 'Demo',
    provider: 'monoerp/demo-data-connector',
    config: { apiKey: 'monoerp_local', apiBase: 'http://demo:4020' },
  })
  expect(
    resolveSource(sources.demo, { DEMO_API_KEY: 'test', DEMO_ENVIRONMENT: '' }).config,
  ).toEqual({ apiKey: 'test', environment: 'staging' })
  expect(
    resolveSource(sources.demo, {
      DEMO_API_KEY: 'test',
      DEMO_API_BASE: 'ignored',
      DEMO_ENVIRONMENT: 'production',
    }).config,
  ).toEqual({ apiKey: 'test', environment: 'production' })
  expect(resolveSource(sources.portal, {})).not.toHaveProperty('ssl')
  expect(
    resolveSource(sources.portal, { CUSTOMER_MYSQL_INTERNAL_PORT: '3333', DB_SSL_MODE: 'require' }),
  ).toMatchObject({ port: 3333, ssl: { mode: 'require' } })
  expect(
    resolveSource(sources.stripe, { STRIPE_API_KEY: '', STRIPE_API_BASE: 'http://example.test' })
      .config,
  ).toEqual({ apiKey: '', apiBase: 'http://example.test' })
})

it('checks and previews removal in a download without Git metadata', () => {
  const { root, manifest } = fixture()
  rmSync(new URL('.git/', root), { recursive: true })
  expect(checkApp(root)).toHaveLength(2)
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(manifest.ownedPaths)
  write(root, 'connectors/leftover/node_modules/package/index.js')
  write(root, 'connectors/leftover/dist/extension.js')
  expect(checkApp(root)).toHaveLength(2)
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(manifest.ownedPaths)
  write(root, 'apps/web/src/routes/unowned.tsx')
  expect(() => checkApp(root)).toThrow('unowned.tsx: expected one owner, found 0')
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(manifest.ownedPaths)
})

it('allows missing owned dotfolders while keeping referenced files required', () => {
  const { root, manifest } = fixture()
  const starterPath = new URL('starter.json', root)
  const starter = JSON.parse(readFileSync(starterPath, 'utf8'))
  starter.ownedPaths.push('.github', '.vscode')
  writeFileSync(starterPath, JSON.stringify(starter))
  manifest.ownedPaths.push('already-removed')
  save(root, 'modules/sales/module.json', manifest)
  expect(checkApp(root)).toHaveLength(2)
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(manifest.ownedPaths)
  rmSync(new URL('apps/web/src/modules/sales/module.ts', root))
  expect(() => checkApp(root)).toThrow(
    'sales: apps/web/src/modules/sales/module.ts is listed but missing',
  )
})

it('removes declared package entries and keeps unrelated commands and dependencies', () => {
  const { root, manifest } = fixture()
  write(
    root,
    'package.json',
    JSON.stringify({ scripts: { check: 'check', 'setup:sales': 'setup' } }),
  )
  write(
    root,
    'apps/web/package.json',
    JSON.stringify({ dependencies: { shared: '1.0.0', widget: '1.0.0' } }),
  )
  manifest.packageEntries = [
    { path: 'package.json', section: 'scripts', names: ['setup:sales'] },
    { path: 'apps/web/package.json', section: 'dependencies', names: ['widget'] },
  ]
  save(root, 'modules/sales/module.json', manifest)
  removeInstalled('sales', { root, dryRun: true })
  expect(
    JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts['setup:sales'],
  ).toBe('setup')
  expect(
    JSON.parse(readFileSync(new URL('apps/web/package.json', root), 'utf8')).dependencies.widget,
  ).toBe('1.0.0')
  removeInstalled('sales', { root })
  expect(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts).toEqual({
    check: 'check',
  })
  expect(
    JSON.parse(readFileSync(new URL('apps/web/package.json', root), 'utf8')).dependencies,
  ).toEqual({ shared: '1.0.0' })
  expect(checkApp(root).map((manifest) => manifest.id)).toEqual(['starter'])
})

it.each(['?query', '#fragment', ' '])(
  'rejects URL punctuation in literal file lists (%s)',
  (suffix) => {
    const { root, manifest } = fixture()
    const file = new URL('starter.json', root)
    const starter = JSON.parse(readFileSync(file, 'utf8'))
    starter.ownedPaths.push('docs')
    writeFileSync(file, JSON.stringify(starter))
    write(root, 'docs/keep.txt', 'keep')
    manifest.ownedPaths.push(`docs${suffix}`)
    save(root, 'modules/sales/module.json', manifest)

    expect(() => removeInstalled('sales', { root })).toThrow('literal repository-relative path')
    expect(readFileSync(new URL('docs/keep.txt', root), 'utf8')).toBe('keep')
  },
)

it('rejects file URLs and case aliases for protected Git paths', () => {
  const { root, manifest } = fixture()
  manifest.ownedPaths.push(`file:${fileURLToPath(new URL('docs', root))}`)
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow('literal repository-relative path')

  manifest.ownedPaths.pop()
  manifest.ownedPaths.push('.GIT/config')
  save(root, 'modules/sales/module.json', manifest)
  expect(() => removeInstalled('sales', { root })).toThrow('literal repository-relative path')
  expect(existsSync(new URL('.git/config', root))).toBe(true)
})

it('discovers and removes add-ons through ownership and package entries', () => {
  const { root } = fixture()
  write(root, 'package.json', JSON.stringify({ scripts: { deploy: 'example', keep: 'kept' } }))
  save(root, 'addons/deployment/addon.json', {
    kind: 'addon',
    id: 'deployment',
    ownedPaths: ['addons/deployment', 'infra/deployment'],
    packageEntries: [{ path: 'package.json', section: 'scripts', names: ['deploy'] }],
  })
  write(root, 'infra/deployment/run.mjs')
  expect(checkApp(root).map(({ id }) => id)).toContain('deployment')
  removeInstalled('deployment', { root })
  expect(existsSync(new URL('infra/deployment', root))).toBe(false)
  expect(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts).toEqual({
    keep: 'kept',
  })
  expect(checkApp(root).map(({ id }) => id)).not.toContain('deployment')
})

it('recognizes conditional setup dependencies after their optional connector is removed', () => {
  const { root } = fixture()

  const billing = {
    kind: 'connector',
    id: 'billing',
    setup: {
      beforeSchema: [{ title: 'Join portal', script: 'join.mjs', requires: ['portal'] }],
      afterSchema: [],
    },
    frontend: [
      {
        module: 'sales',
        path: 'connectors/billing/frontend/sales',
        slot: 'organization-panel',
        order: 0,
        collections: [],
        schemas: [],
        requires: ['portal'],
      },
    ],
  }

  save(root, 'connectors/billing/connector.json', billing)
  write(root, 'connectors/billing/monospace/setup/join.mjs')
  write(root, 'connectors/billing/frontend/sales/feature.tsx')
  expect(checkApp(root).map((manifest) => manifest.id)).toContain('billing')
  expect(() => removeInstalled('billing', { root })).not.toThrow()
})
