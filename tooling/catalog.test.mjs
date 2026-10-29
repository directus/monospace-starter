import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildCatalog, checkReadme, readmeHeadings, render, schema } from './catalog.mjs'

function write(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'catalog-')))
  // Fields beyond label and description are ignored.
  write(root, 'starters/sales/package.json', { name: 'sales', version: '1.2.0', private: true })
  write(root, 'starters/sales/starter.json', {
    label: 'Sales',
    description: 'Sales app',
    ownedPaths: ['x'],
  })
  write(root, 'starters/sales/modules/deals/module.json', {
    label: 'Deals',
    description: 'Pipeline',
    'x-monoerp': { collections: ['deals'] },
  })
  write(root, 'starters/sales/modules/accounts/module.json', {
    label: 'Accounts',
    description: 'Companies',
  })
  write(root, 'starters/sales/connectors/billing/connector.json', {
    label: 'Billing',
    description: 'Invoices',
  })
  write(root, 'starters/sales/connectors/README.md', '# Connectors')
  write(root, 'starters/blank/package.json', { name: 'blank', version: '0.0.0' })
  write(root, 'starters/blank/starter.json', { label: 'Blank', description: 'Nothing else' })
  const readme = `# Name\n\n${readmeHeadings.map((heading) => `## ${heading}\n\ntext\n`).join('\n')}`
  write(root, 'starters/sales/README.md', readme)
  write(root, 'starters/blank/README.md', `${readme}\n## Extra\n`)

  return root
}

it('lists starters with their version, and their parts by folder, sorted, with label and description only', () => {
  assert.deepEqual(buildCatalog(fixture()), {
    $schema: schema,
    starters: [
      {
        id: 'blank',
        path: 'starters/blank',
        version: '0.0.0',
        label: 'Blank',
        description: 'Nothing else',
        modules: [],
        connectors: [],
        deploy: [],
      },
      {
        id: 'sales',
        path: 'starters/sales',
        version: '1.2.0',
        label: 'Sales',
        description: 'Sales app',
        modules: [
          { id: 'accounts', label: 'Accounts', description: 'Companies' },
          { id: 'deals', label: 'Deals', description: 'Pipeline' },
        ],
        connectors: [{ id: 'billing', label: 'Billing', description: 'Invoices' }],
        deploy: [],
      },
    ],
  })
})

it('fails on a starter or part folder without a usable manifest', () => {
  const root = fixture()
  mkdirSync(join(root, 'starters/sales/deploy/aws'), { recursive: true })
  assert.throws(() => buildCatalog(root), /starters\/sales\/deploy\/aws\/deploy\.json is missing/)

  const other = fixture()
  write(other, 'starters/blank/starter.json', { label: 'Blank' })
  assert.throws(
    () => buildCatalog(other),
    /starters\/blank\/starter\.json: description must be a non-empty string/,
  )
})

it('fails on a starter whose package name does not match its folder, or has no version', () => {
  const root = fixture()
  write(root, 'starters/sales/package.json', { name: '@acme/sales', version: '1.0.0' })
  assert.throws(() => buildCatalog(root), /starters\/sales\/package\.json: name must be "sales"/)

  write(root, 'starters/sales/package.json', { name: 'sales' })
  assert.throws(() => buildCatalog(root), /starters\/sales\/package\.json: version must be/)
})

it('requires every README section, in any order, allowing extra sections', () => {
  const root = fixture()
  checkReadme(root, 'starters/sales')
  checkReadme(root, 'starters/blank')

  write(root, 'starters/blank/README.md', `# Blank\n\n${readmeHeadings.toReversed().map((heading) => `## ${heading}\n`).join('\n')}`)
  checkReadme(root, 'starters/blank')

  write(root, 'starters/blank/README.md', '# Blank\n\n## Quickstart\n\n## Docs\n')
  assert.throws(() => checkReadme(root, 'starters/blank'), /missing "## What's inside", "## Everyday commands"/)

  write(root, 'starters/blank/README.md', readFileSync(join(root, 'starters/sales/README.md'), 'utf8').replace('## Deploy', '## Deployment'))
  assert.throws(() => checkReadme(root, 'starters/blank'), /missing "## Deploy"/)
})

it('matches the committed catalog.json', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  assert.equal(readFileSync(join(root, 'catalog.json'), 'utf8'), render(buildCatalog(root)))
})

it('--check passes on a fresh catalog and exits 1 once a part is added', () => {
  // The script resolves the root from its own location, so a copy runs against the fixture.
  const root = fixture()
  write(root, 'tooling/catalog.mjs', readFileSync(new URL('catalog.mjs', import.meta.url), 'utf8'))
  const script = join(root, 'tooling/catalog.mjs')

  assert.equal(spawnSync('node', [script, '--check']).status, 1)
  execFileSync('node', [script])
  assert.match(execFileSync('node', [script, '--check'], { encoding: 'utf8' }), /up to date/)

  write(root, 'starters/blank/deploy/aws/deploy.json', { label: 'AWS', description: 'Deploy' })
  const stale = spawnSync('node', [script, '--check'], { encoding: 'utf8' })
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /catalog\.json is stale/)
})
