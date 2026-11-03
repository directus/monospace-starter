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

import { afterEach, expect, it, vi } from 'vitest'

import { readManifests, resolveSource } from '../infra/manifests.mjs'
import { checkApp, removeInstalled } from './app.mjs'
import { manifestDocument, manifestPath } from './manifest-fixtures.mjs'
import { path } from './manifest-schema.mjs'

const directories = []

function write(root, path, value = '') {
  const url = new URL(path, root)
  mkdirSync(new URL('./', url), { recursive: true })
  writeFileSync(url, value)
}

function save(root, manifest) {
  write(root, manifestPath(manifest), JSON.stringify(manifestDocument(manifest)))
}

const ids = (root) => checkApp(root).manifests.map(({ id }) => id)

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'monoerp-removal-'))
  directories.push(directory)
  const root = pathToFileURL(`${directory}/`)
  save(root, { kind: 'starter', id: 'starter' })

  const manifest = {
    kind: 'module',
    id: 'sales',
    collections: ['organizations'],
    writes: ['organizations'],
  }

  save(root, manifest)
  write(root, 'modules/sales/module.ts')
  write(root, 'modules/sales/routes/app/index.tsx')
  write(root, 'modules/sales/infra/postgres/init/001_schema.sql')

  return { root, manifest }
}

afterEach(() => {
  vi.restoreAllMocks()

  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('previews without writes, then removes the part folder and leaves a valid starter', () => {
  const { root } = fixture()
  write(root, 'keep.txt', 'keep')
  expect(removeInstalled('sales', { root, dryRun: true })).toEqual(['modules/sales'])
  expect(existsSync(new URL('modules/sales/module.json', root))).toBe(true)
  removeInstalled('sales', { root })
  expect(existsSync(new URL('modules/sales', root))).toBe(false)
  expect(readFileSync(new URL('keep.txt', root), 'utf8')).toBe('keep')
  expect(ids(root)).toEqual(['starter'])
})

it('takes id from the folder and kind from the parent directory', () => {
  const { root } = fixture()
  const sales = readManifests(root).find(({ id }) => id === 'sales')
  expect(sales).toMatchObject({
    kind: 'module',
    app: 'modules/sales',
    infra: 'modules/sales/infra',
    ownedPaths: ['modules/sales'],
  })
  const file = new URL('modules/sales/module.json', root)
  const document = JSON.parse(readFileSync(file, 'utf8'))

  writeFileSync(file, JSON.stringify({ ...document, kind: 'module' }))
  expect(() => readManifests(root)).toThrow('Unrecognized key')

  writeFileSync(
    file,
    JSON.stringify({ ...document, $schema: 'https://monospace.io/schemas/starter/v1/deploy.json' }),
  )
  expect(() => readManifests(root)).toThrow('$schema must be')
})

it('lists what it discovered on disk for each part', () => {
  const { root } = fixture()
  write(root, 'modules/sales/routes/settings/stages.tsx')
  write(root, 'modules/sales/infra/monospace/schema/app.json', '{}')
  write(root, 'modules/sales/infra/monospace/setup/seed.mjs')
  save(root, {
    kind: 'module',
    id: 'sales',
    collections: [],
    setup: { afterSchema: [{ title: 'Seed', script: 'seed.mjs' }] },
  })
  save(root, { kind: 'connector', id: 'billing' })

  for (const path of [
    'compose.yml',
    'emulator/migrate.sh',
    'emulator/provision.sh',
    'monospace/schema/billing.json',
  ])
    write(root, `connectors/billing/${path}`, '{}')

  write(root, 'connectors/billing/extension/extension.config.json', '{"id":"acme/billing"}')

  expect(checkApp(root).report).toEqual([
    'starter: owns every path outside the parts',
    'sales (module): routes app+settings, 1 schema file, 1 setup step',
    'billing (connector): compose, extension acme__billing, 1 schema file, 0 setup steps, migrate, provision',
  ])
  expect(readManifests(root).find(({ id }) => id === 'billing')).toMatchObject({
    compose: 'connectors/billing/compose.yml',
    schemaFiles: ['connectors/billing/monospace/schema/billing.json'],
    migrate: 'emulator/migrate.sh',
    provision: 'emulator/provision.sh',
  })
})

it('fails on a part folder without its manifest', () => {
  const { root } = fixture()
  write(root, 'connectors/leftover/compose.yml')
  expect(() => checkApp(root)).toThrow(
    'connectors/leftover: every folder here is a connector; add connectors/leftover/connector.json',
  )
  write(root, 'connectors/README.md')
  rmSync(new URL('connectors/leftover', root), { recursive: true })
  expect(ids(root)).toEqual(['starter', 'sales'])
})

it('fails on broken conventions: missing entry, setup script, and frontend feature', () => {
  const { root, manifest } = fixture()
  rmSync(new URL('modules/sales/module.ts', root))
  expect(() => checkApp(root)).toThrow('sales: modules/sales/module.ts is missing')
  write(root, 'modules/sales/module.ts')

  save(root, { ...manifest, setup: { beforeSchema: [{ title: 'Seed', script: 'seed.mjs' }] } })
  expect(() => checkApp(root)).toThrow(
    'sales: setup script modules/sales/infra/monospace/setup/seed.mjs is missing',
  )
  save(root, manifest)

  save(root, { kind: 'connector', id: 'billing', contributes: { sales: { collections: [] } } })
  expect(() => checkApp(root)).toThrow(
    'billing: contributes.sales needs connectors/billing/frontend/sales/feature.tsx',
  )
  write(root, 'connectors/billing/frontend/sales/feature.tsx')
  write(root, 'connectors/billing/frontend/inventory/feature.tsx')
  expect(() => checkApp(root)).toThrow(
    'billing: connectors/billing/frontend/inventory needs an x-monoerp.contributes.inventory entry',
  )
  rmSync(new URL('connectors/billing/frontend/inventory', root), { recursive: true })

  write(root, 'connectors/billing/extension/package.json', '{}')
  expect(() => checkApp(root)).toThrow('billing: extension/ needs extension.config.json')
})

it('refuses removal of required parts, starter, and unknown ids before writing', () => {
  const { root, manifest } = fixture()
  expect(() => removeInstalled('starter', { root })).toThrow('Starter is always installed')
  expect(() => removeInstalled('missing', { root })).toThrow(
    'Unknown module, connector, or deploy target',
  )

  save(root, { kind: 'connector', id: 'billing' })
  save(root, { ...manifest, requires: ['billing'] })
  expect(() => removeInstalled('billing', { root })).toThrow('billing is required by sales')
  expect(existsSync(new URL('connectors/billing/connector.json', root))).toBe(true)
})

it('rejects missing requirements, cycles, and duplicate ids before deleting anything', () => {
  const { root, manifest } = fixture()
  save(root, { ...manifest, requires: ['missing'] })
  expect(() => removeInstalled('sales', { root })).toThrow(
    'sales: required part missing has no folder',
  )
  expect(existsSync(new URL('modules/sales/module.ts', root))).toBe(true)

  save(root, { ...manifest, requires: ['billing'] })
  save(root, { kind: 'connector', id: 'billing', requires: ['sales'] })
  expect(() => checkApp(root)).toThrow('Circular requirements')

  save(root, manifest)
  save(root, { kind: 'connector', id: 'sales' })
  expect(() => checkApp(root)).toThrow('Part ids must be unique across kinds: sales')
})

it('rejects alsoOwns that overlap a part folder, another part, or are missing', () => {
  const { root, manifest } = fixture()

  for (const path of ['modules/sales/routes', 'connectors', 'starter.json']) {
    save(root, { ...manifest, alsoOwns: [path] })
    expect(() => checkApp(root)).toThrow('Overlapping ownership')
  }

  write(root, '.github/workflows/sales.yml')
  save(root, { ...manifest, alsoOwns: ['.github/workflows/sales.yml'] })
  save(root, { kind: 'deploy', id: 'cloud', alsoOwns: ['.github/workflows'] })
  expect(() => checkApp(root)).toThrow('Overlapping ownership: sales:.github/workflows/sales.yml')

  save(root, { kind: 'deploy', id: 'cloud', alsoOwns: ['.github/workflows/cloud.yml'] })
  expect(() => checkApp(root)).toThrow('cloud: alsoOwns .github/workflows/cloud.yml is missing')
})

it('rejects unsafe paths in manifests before anything is deleted', () => {
  for (const unsafe of [
    '../escape',
    '/absolute',
    'apps/../escape',
    'apps//web',
    '.GIT/config',
    'node_modules/demo',
    'apps/%2e%2e/escape',
    'docs?query',
    'docs#fragment',
    'docs ',
    'file:/tmp/docs',
  ])
    expect(path.safeParse(unsafe).success, unsafe).toBe(false)

  const { root, manifest } = fixture()
  write(root, 'docs/keep.txt', 'keep')
  save(root, { ...manifest, alsoOwns: ['../escape'] })
  expect(() => removeInstalled('sales', { root })).toThrow('literal repository-relative path')
  expect(existsSync(new URL('modules/sales/module.json', root))).toBe(true)
  expect(readFileSync(new URL('docs/keep.txt', root), 'utf8')).toBe('keep')
})

it('refuses symlinked part folders and alsoOwns', () => {
  const { root, manifest } = fixture()
  write(root, 'elsewhere/file.txt')
  symlinkSync(fileURLToPath(new URL('elsewhere/', root)), new URL('linked', root))
  save(root, { ...manifest, alsoOwns: ['linked/file.txt'] })
  expect(() => removeInstalled('sales', { root })).toThrow('symlinks cannot be owned or traversed')
  save(root, manifest)

  symlinkSync(fileURLToPath(new URL('modules/sales/', root)), new URL('modules/copy', root))
  expect(() => checkApp(root)).toThrow('symlinks cannot be owned or traversed')
})

it('rejects writes that are not collections', () => {
  const { root, manifest } = fixture()
  save(root, { ...manifest, writes: ['missing'] })
  expect(() => checkApp(root)).toThrow('writes missing from collections: missing')
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

it('removes package entries by value and refuses entries that drifted', () => {
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
  save(root, {
    ...manifest,
    packageEntries: [
      { file: 'package.json', section: 'scripts', entries: { 'setup:sales': 'setup' } },
      { file: 'apps/web/package.json', section: 'dependencies', entries: { widget: '2.0.0' } },
    ],
  })
  expect(() => checkApp(root)).toThrow(
    'sales: apps/web/package.json dependencies.widget must be "2.0.0"',
  )
  save(root, {
    ...manifest,
    packageEntries: [
      { file: 'package.json', section: 'scripts', entries: { 'setup:sales': 'setup' } },
      { file: 'apps/web/package.json', section: 'dependencies', entries: { widget: '1.0.0' } },
    ],
  })
  removeInstalled('sales', { root, dryRun: true })
  expect(
    JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts['setup:sales'],
  ).toBe('setup')
  removeInstalled('sales', { root })
  expect(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts).toEqual({
    check: 'check',
  })
  expect(
    JSON.parse(readFileSync(new URL('apps/web/package.json', root), 'utf8')).dependencies,
  ).toEqual({ shared: '1.0.0' })
  expect(ids(root)).toEqual(['starter'])
})

it('discovers deploy lint and removes deploy targets with alsoOwns and package entries', () => {
  const { root } = fixture()
  write(root, 'package.json', JSON.stringify({ scripts: { deploy: 'example', keep: 'kept' } }))
  write(root, '.github/workflows/deploy-example.yml')
  save(root, {
    kind: 'deploy',
    id: 'example',
    alsoOwns: ['.github/workflows/deploy-example.yml'],
    packageEntries: [{ file: 'package.json', section: 'scripts', entries: { deploy: 'example' } }],
  })
  write(root, 'deploy/example/lint/config.ts')
  expect(readManifests(root).find(({ id }) => id === 'example').lint).toBe(
    'deploy/example/lint/config.ts',
  )
  expect(removeInstalled('example', { root })).toEqual([
    'deploy/example',
    '.github/workflows/deploy-example.yml',
  ])
  expect(existsSync(new URL('.github/workflows/deploy-example.yml', root))).toBe(false)
  expect(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).scripts).toEqual({
    keep: 'kept',
  })
  expect(ids(root)).not.toContain('example')
})

it('allows removing a connector another feature needs, and reports that feature off', () => {
  const { root } = fixture()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  save(root, { kind: 'connector', id: 'portal' })
  save(root, {
    kind: 'connector',
    id: 'billing',
    setup: { beforeSchema: [{ title: 'Join portal', script: 'join.mjs', requires: ['portal'] }] },
    contributes: { sales: { requires: ['portal'], collections: ['charges'] } },
  })
  write(root, 'connectors/billing/monospace/setup/join.mjs')
  write(root, 'connectors/billing/frontend/sales/feature.tsx')
  const billing = () => checkApp(root).report.find((line) => line.startsWith('billing'))
  expect(billing()).toContain('sales feature on')

  removeInstalled('portal', { root })
  expect(log).toHaveBeenCalledWith('billing: sales feature turns off: needs portal')
  expect(billing()).toContain('sales feature off: needs portal')
  removeInstalled('sales', { root })
  expect(billing()).toContain('sales feature off: needs sales, portal')
})

it.each(['yaml', 'yml'])(
  'removes owned %s entries and preserves unrelated patches',
  (extension) => {
    const { root, manifest } = fixture()
    write(
      root,
      `pnpm-workspace.${extension}`,
      '# Keep this comment\npatchedDependencies:\n  alchemy: patches/alchemy.patch\n  cli: patches/cli.patch\n',
    )
    save(root, {
      ...manifest,
      packageEntries: [
        {
          file: `pnpm-workspace.${extension}`,
          section: 'patchedDependencies',
          entries: { alchemy: 'patches/alchemy.patch' },
        },
      ],
    })
    removeInstalled('sales', { root, dryRun: true })
    expect(readFileSync(new URL(`pnpm-workspace.${extension}`, root), 'utf8')).toContain('alchemy:')
    removeInstalled('sales', { root })
    const remaining = readFileSync(new URL(`pnpm-workspace.${extension}`, root), 'utf8')
    expect(remaining).not.toContain('alchemy:')
    expect(remaining).toContain('cli: patches/cli.patch')
    expect(remaining).toContain('# Keep this comment')
  },
)

it.each([
  { indent: '\t', newline: '\r\n', trailing: '\r\n' },
  { indent: '    ', newline: '\n', trailing: '' },
  { indent: undefined, newline: '\n', trailing: '\n' },
  { indent: undefined, newline: '\n', trailing: '' },
])(
  'preserves JSON style with $indent indent and trailing $trailing',
  ({ indent, newline, trailing }) => {
    const { root, manifest } = fixture()

    const value = {
      scripts: { remove: 'gone', keep: 'kept' },
      dependencies: { remove: '1', keep: '2' },
    }

    write(
      root,
      'package.json',
      JSON.stringify(value, null, indent).replaceAll('\n', newline) + trailing,
    )
    save(root, {
      ...manifest,
      packageEntries: [
        { file: 'package.json', section: 'scripts', entries: { remove: 'gone' } },
        { file: 'package.json', section: 'dependencies', entries: { remove: '1' } },
      ],
    })
    removeInstalled('sales', { root })
    const expected = { scripts: { keep: 'kept' }, dependencies: { keep: '2' } }
    expect(readFileSync(new URL('package.json', root), 'utf8')).toBe(
      JSON.stringify(expected, null, indent).replaceAll('\n', newline) + trailing,
    )
  },
)

it('refuses to overwrite a package file changed after it was read', () => {
  const { root, manifest } = fixture()
  write(root, 'package.json', JSON.stringify({ scripts: { remove: 'gone', keep: 'kept' } }))
  save(root, {
    ...manifest,
    packageEntries: [{ file: 'package.json', section: 'scripts', entries: { remove: 'gone' } }],
  })
  const concurrent = JSON.stringify({ scripts: { remove: 'new value', keep: 'kept' } })
  vi.spyOn(console, 'log').mockImplementation(() => write(root, 'package.json', concurrent))

  expect(() => removeInstalled('sales', { root })).toThrow('package.json changed during removal')
  expect(readFileSync(new URL('package.json', root), 'utf8')).toBe(concurrent)
  expect(existsSync(new URL('modules/sales/module.json', root))).toBe(true)
})

it("prints how to delete a removed part's Docker volumes, under this project's name", () => {
  const { root } = fixture()
  save(root, { kind: 'connector', id: 'billing' })
  write(root, '.env', 'APP_PORT=3000\nCOMPOSE_PROJECT_NAME=shop-a1b2\n')
  write(
    root,
    'connectors/billing/compose.yml',
    [
      'services:',
      '  billing-db:',
      '    image: mysql:8.4',
      'volumes:',
      '  billing_data:',
      '  named:',
      '    name: billing-shared',
      '  outside:',
      '    external: true',
    ].join('\n'),
  )

  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  removeInstalled('billing', { root })

  expect(log).toHaveBeenCalledWith(
    'Its Docker data is kept. To delete it, after the commands below: docker volume rm shop-a1b2_billing_data billing-shared',
  )
})
