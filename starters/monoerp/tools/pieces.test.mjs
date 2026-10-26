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

import { resolveSource } from '../infra/pieces.mjs'
import { checkPieces, removePiece } from './pieces.mjs'

const directories = []

function write(root, path, value = '') {
  const url = new URL(path, root)
  mkdirSync(new URL('./', url), { recursive: true })
  writeFileSync(url, value)
}

function save(root, path, piece) {
  write(root, path, JSON.stringify(piece))
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'monoerp-removal-'))
  directories.push(directory)
  execFileSync('git', ['init', '--quiet'], { cwd: directory })
  const root = pathToFileURL(`${directory}/`)
  save(root, 'core/piece.json', {
    kind: 'core',
    id: 'core',
    label: 'Core',
    description: 'Shared',
    ownedPaths: ['core'],
    requires: [],
    optional: [],
  })

  const piece = {
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

  save(root, 'modules/sales/piece.json', piece)
  write(root, 'apps/web/src/modules/sales/module.ts')
  write(root, 'infra/modules/sales/schema.sql')
  write(root, 'apps/web/src/routes/sales.tsx')

  return { root, piece }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('previews without writes, then removes only declared paths and leaves a valid core', () => {
  const { root, piece } = fixture()
  write(root, 'keep.txt', 'keep')
  expect(removePiece('sales', { root, dryRun: true })).toEqual(piece.ownedPaths)
  expect(existsSync(new URL('modules/sales/piece.json', root))).toBe(true)
  removePiece('sales', { root })
  expect(piece.ownedPaths.every((path) => !existsSync(new URL(path, root)))).toBe(true)
  expect(readFileSync(new URL('keep.txt', root), 'utf8')).toBe('keep')
  expect(checkPieces(root).map((piece) => piece.id)).toEqual(['core'])
})

it('refuses removal of required pieces, core, and unknown ids before writing', () => {
  const { root, piece } = fixture()
  piece.requires = ['core']
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('core', { root })).toThrow('Core is always installed')
  expect(() => removePiece('missing', { root })).toThrow('Unknown piece')

  const dependency = {
    kind: 'connector',
    id: 'billing',
    label: 'Billing',
    description: 'Billing',
    ownedPaths: ['connectors/billing'],
    requires: [],
    optional: [],
    provides: [],
    env: [],
    schemaFiles: [],
    source: { provider: 'demo' },
    setup: { beforeSchema: [], afterSchema: [] },
  }

  save(root, 'connectors/billing/piece.json', dependency)
  piece.requires = ['billing']
  piece.optional = []
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('billing', { root })).toThrow('billing is required by sales')
  expect(existsSync(new URL('connectors/billing/piece.json', root))).toBe(true)
})

it('rejects missing dependencies and paths before deleting anything', () => {
  const { root, piece } = fixture()
  piece.requires = ['missing']
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('sales', { root })).toThrow('required piece missing is absent')
  piece.requires = []
  piece.ownedPaths.push('missing')
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('sales', { root })).toThrow('ENOENT')
  expect(existsSync(new URL('apps/web/src/routes/sales.tsx', root))).toBe(true)
})

it('rejects overlapping ownership even within a single piece', () => {
  const { root, piece } = fixture()
  piece.ownedPaths.push('apps/web/src/routes')
  save(root, 'modules/sales/piece.json', piece)
  expect(() => checkPieces(root)).toThrow('Overlapping ownership')
})

it('finds new unowned source files and ignores generated files', () => {
  const { root } = fixture()
  write(root, '.gitignore', 'infra/modules/sales/generated/\n')
  write(root, 'infra/modules/sales/generated/build.js')
  expect(checkPieces(root)).toHaveLength(2)
  write(root, 'apps/web/src/routes/new.tsx')
  expect(() => checkPieces(root)).toThrow('new.tsx: expected one owner, found 0')
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
  const { root, piece } = fixture()
  piece.ownedPaths.push(path)
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('sales', { root })).toThrow()
  expect(existsSync(new URL('modules/sales/piece.json', root))).toBe(true)
})

it('refuses symlink ownership and symlink ancestors', () => {
  const { root, piece } = fixture()
  symlinkSync(fileURLToPath(new URL('apps/web/src/modules/sales/', root)), new URL('linked', root))
  piece.ownedPaths.push('linked/module.ts')
  save(root, 'modules/sales/piece.json', piece)
  expect(() => removePiece('sales', { root })).toThrow('symlinks cannot be owned or traversed')
})

it('rejects schema drift and references outside owned paths', () => {
  const { root, piece } = fixture()
  piece.schemas = ['missing']
  save(root, 'modules/sales/piece.json', piece)
  expect(() => checkPieces(root)).toThrow('schemas missing from collections: missing')
  piece.schemas = []
  piece.settings = ['core/piece.json']
  save(root, 'modules/sales/piece.json', piece)
  expect(() => checkPieces(root)).toThrow('referenced path is not owned')
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
