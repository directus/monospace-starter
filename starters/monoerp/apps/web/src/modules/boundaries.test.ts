import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const src = fileURLToPath(new URL('../', import.meta.url))

const root = fileURLToPath(new URL('../../../../', import.meta.url))

const connectors = join(root, 'connectors')

const manifestReader = await import(
  new URL('../../../../infra/manifests.mjs', import.meta.url).href
)

const routeOwners = z
  .array(z.object({ kind: z.string(), id: z.string(), ownedPaths: z.array(z.string()) }))
  .parse(manifestReader.readManifests())
  .filter((manifest) => manifest.kind === 'module')

type RouteOwner = { id: string; ownedPaths: string[] }

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return []
    const path = join(directory, entry.name)

    return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : []
  })
}

function moduleId(path: string) {
  const parts = path.split('/')

  return parts[0] === 'modules' && parts.length > 2 ? parts[1] : undefined
}

function importPaths(source: string) {
  const file = ts.createSourceFile(
    'source.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  const paths: string[] = []

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      paths.push(node.moduleSpecifier.text)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      paths.push(node.moduleReference.expression.text)
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      paths.push(node.arguments[0].text)
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      paths.push(node.argument.literal.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(file)

  return paths
}

function violations(path: string, source: string, owners: RouteOwner[] = routeOwners) {
  const feature = path.startsWith('connectors/')
  const sourcePath = feature ? path : `apps/web/src/${path}`

  if (!feature && ['modules/index.ts', 'routeTree.gen.ts'].includes(path)) return []

  const ownerOf = (target: string) =>
    moduleId(target.replace(/^apps\/web\/src\//, '')) ??
    owners.find((owner) =>
      owner.ownedPaths.some((owned) => target === owned || target.startsWith(`${owned}/`)),
    )?.id

  return importPaths(source).flatMap((specifier) => {
    const target =
      specifier.startsWith('@/') || specifier.startsWith('#/')
        ? posix.normalize(`apps/web/src/${specifier.slice(2)}`)
        : specifier.startsWith('.')
          ? posix.normalize(posix.join(dirname(sourcePath), specifier))
          : ''

    const importedModule = ownerOf(target)
    const localFeature = `connectors/${path.split('/')[1]}/frontend/`

    const forbidden = feature
      ? target &&
        !(
          target.startsWith(localFeature) ||
          (target.startsWith('apps/web/src/') && !importedModule)
        )
      : (importedModule && importedModule !== ownerOf(sourcePath)) ||
        target.startsWith('connectors/')

    return forbidden ? [`${path} imports ${specifier}`] : []
  })
}

describe('module boundaries', () => {
  it('keeps core independent of modules and modules independent of each other', () => {
    const featureFiles = existsSync(connectors)
      ? readdirSync(connectors, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory() ? sourceFiles(join(connectors, entry.name, 'frontend')) : [],
        )
      : []

    const invalid = [
      ...sourceFiles(src).flatMap((path) =>
        violations(relative(src, path), readFileSync(path, 'utf8')),
      ),
      ...featureFiles.flatMap((path) =>
        violations(relative(root, path), readFileSync(path, 'utf8')),
      ),
    ]

    expect(invalid).toEqual([])
  })

  it.each([
    "import {\n UserLabel\n} from '@/modules/crm/components/entities'",
    "export { lookupUsers } from '@/modules/crm/data'",
    "import type { Row } from '#/modules/crm/data'",
    "const data = import('@/modules/crm/data')",
    "const data = require('@/modules/crm/data')",
    "type Row = import('@/modules/crm/data').Row",
    "import data = require('@/modules/crm/data')",
    "import { lookupUsers } from '../crm/data'",
  ])('rejects a dependency on another module: %s', (source) => {
    expect(violations('modules/inventory/data.ts', source)).toHaveLength(1)
  })

  it('rejects core imports of module code, including tests', () => {
    expect(
      violations(
        'components/example.browser.tsx',
        "import '@/modules/crm/components/inline-owner'",
      ),
    ).toHaveLength(1)
  })

  it('allows core helpers, module-local imports, the registry, and routes', () => {
    expect(violations('modules/inventory/data.ts', "import '@/lib/user-options'")).toEqual([])
    expect(
      violations('modules/inventory/data.ts', "import '@/modules/inventory/inventory.copy'"),
    ).toEqual([])
    expect(violations('modules/inventory/data.ts', "import './inventory.copy'")).toEqual([])
    expect(violations('shell/app-shell.tsx', "import '@/modules/types'")).toEqual([])
    expect(violations('modules/index.ts', "export * from './crm/module'")).toEqual([])
    expect(violations('routeTree.gen.ts', "import './routes/_app/crm/index'")).toEqual([])
  })

  it('ignores comments and strings that are not imports', () => {
    expect(
      violations(
        'components/example.tsx',
        "// import '@/modules/crm/data'\nconst example = \"import '@/modules/crm/data'\"",
      ),
    ).toEqual([])
  })
})

it.each([
  "import { crmCopy } from '@/modules/crm/crm.copy'",
  "import type { Row } from '#/modules/inventory/data'",
  "export * from '../../../../apps/web/src/modules/crm/data'",
  "import '../../../demo/frontend/crm/data'",
])('keeps connector features independent of modules and other connectors: %s', (source) => {
  expect(violations('connectors/stripe/frontend/crm/feature.tsx', source)).toHaveLength(1)
})

it('allows connector-local files, core UI, contracts, and generated types', () => {
  const source =
    "import './data'; import '@/components/source-panel'; import '@/modules/types'; import '@/generated/monospace'"

  expect(violations('connectors/stripe/frontend/crm/feature.tsx', source)).toEqual([])
})

it('checks module, settings, and public routes against manifest ownership', () => {
  const owners: RouteOwner[] = [
    {
      id: 'inventory',
      ownedPaths: [
        'apps/web/src/routes/_app/inventory',
        'apps/web/src/routes/_app/settings.inventory.locations.tsx',
        'apps/web/src/routes/catalog.tsx',
      ],
    },
    { id: 'sales', ownedPaths: ['apps/web/src/routes/_app/sales'] },
  ]

  for (const path of [
    'routes/_app/inventory/index.tsx',
    'routes/_app/settings.inventory.locations.tsx',
    'routes/catalog.tsx',
  ]) {
    expect(violations(path, "import '@/modules/inventory/data'", owners)).toEqual([])
    expect(violations(path, "import '@/modules/sales/data'", owners)).toHaveLength(1)
    expect(
      violations(path, "import '@/../../../connectors/demo/frontend/inventory/data'", owners),
    ).toHaveLength(1)
  }

  expect(
    violations('routes/_app/index.tsx', "import '@/modules/inventory/data'", owners),
  ).toHaveLength(1)
  expect(
    violations('routes/_app/settings.tsx', "import '@/modules/inventory/settings'", owners),
  ).toHaveLength(1)
  expect(violations('routes/_app/index.tsx', "import '@/modules'", owners)).toEqual([])
  expect(violations('routes/_app/settings.tsx', "import '@/modules/types'", owners)).toEqual([])
})

it.each([
  ['modules/crm/data.ts', "import '../../../../../connectors/portal/frontend/crm/data'"],
  [
    'routes/_app/crm/organizations.tsx',
    "import '@/../../../connectors/portal/frontend/crm/feature'",
  ],
])('rejects Portal imports from CRM: %s', (path, source) => {
  expect(violations(path, source)).toHaveLength(1)
})
