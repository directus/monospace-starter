import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Every path below is repository-relative: apps/web/src/... for core, modules/<id>/... for a
// module, connectors/<id>/frontend/<module>/... for a connector feature.
const root = fileURLToPath(new URL('../../../../../', import.meta.url))

const src = join(root, 'apps/web/src')

const modulesDirectory = join(root, 'modules')

const connectors = join(root, 'connectors')

const manifestReader = await import(
  new URL('../../../../../infra/manifests.mjs', import.meta.url).href
)

const routeOwners = z
  .array(z.object({ kind: z.string(), id: z.string(), ownedPaths: z.array(z.string()) }))
  .parse(manifestReader.readManifests())
  .filter((manifest) => manifest.kind === 'module')

type RouteOwner = { id: string; ownedPaths: string[] }

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'generated', 'routeTree.gen.ts'].includes(entry.name)) return []
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

// `@/modules/<id>/...` is aliased to `modules/<id>/...`; every other `@/` path is core source.
function resolveAlias(specifier: string) {
  const path = specifier.slice(2)

  return path.startsWith('modules/')
    ? posix.normalize(path)
    : posix.normalize(`apps/web/src/${path}`)
}

function violations(path: string, source: string, owners: RouteOwner[] = routeOwners) {
  const feature = path.startsWith('connectors/')

  if (['apps/web/src/lib/modules/index.ts', 'apps/web/src/routeTree.gen.ts'].includes(path))
    return []

  const ownerOf = (target: string) =>
    moduleId(target) ??
    owners.find((owner) =>
      owner.ownedPaths.some((owned) => target === owned || target.startsWith(`${owned}/`)),
    )?.id

  return importPaths(source).flatMap((specifier) => {
    const target =
      specifier.startsWith('@/') || specifier.startsWith('#/')
        ? resolveAlias(specifier)
        : specifier.startsWith('.')
          ? posix.normalize(posix.join(dirname(path), specifier))
          : ''

    const importedModule = ownerOf(target)
    const localFeature = `connectors/${path.split('/')[1]}/frontend/`

    const forbidden = feature
      ? target &&
        !(
          target.startsWith(localFeature) ||
          target === `modules/${path.split('/')[3]}/slots` ||
          (target.startsWith('apps/web/src/') && !importedModule)
        )
      : (importedModule && importedModule !== ownerOf(path)) || target.startsWith('connectors/')

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
      ...sourceFiles(src),
      ...sourceFiles(modulesDirectory),
      ...featureFiles,
    ].flatMap((path) => violations(relative(root, path), readFileSync(path, 'utf8')))

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

  it('allows connectors to import only the target module slots', () => {
    const path = 'connectors/portal/frontend/crm/feature.tsx'
    expect(
      violations(path, "import type { OrganizationPanelProps } from '@/modules/crm/slots'"),
    ).toEqual([])
    expect(violations(path, "import '@/modules/crm/data'")).toHaveLength(1)
    expect(violations(path, "import '@/modules/ats/slots'")).toHaveLength(1)
  })

  it('rejects core imports of module code, including tests', () => {
    expect(
      violations(
        'apps/web/src/components/example.browser.tsx',
        "import '@/modules/crm/components/inline-owner'",
      ),
    ).toHaveLength(1)
  })

  it('allows core helpers, module-local imports, the registry, and routes', () => {
    expect(violations('modules/inventory/data.ts', "import '@/lib/users'")).toEqual([])
    expect(
      violations('modules/inventory/data.ts', "import '@/modules/inventory/inventory.copy'"),
    ).toEqual([])
    expect(violations('modules/inventory/data.ts', "import './inventory.copy'")).toEqual([])
    expect(violations('modules/inventory/routes/app/index.tsx', "import '../../data'")).toEqual([])
    expect(violations('apps/web/src/shell/app-shell.tsx', "import '@/lib/modules/types'")).toEqual(
      [],
    )
    expect(
      violations(
        'apps/web/src/lib/modules/index.ts',
        "export * from '../../../../../modules/crm/module'",
      ),
    ).toEqual([])
    expect(
      violations('apps/web/src/routeTree.gen.ts', "import '../../../modules/crm/routes/app/index'"),
    ).toEqual([])
  })

  it('ignores comments and strings that are not imports', () => {
    expect(
      violations(
        'apps/web/src/components/example.tsx',
        "// import '@/modules/crm/data'\nconst example = \"import '@/modules/crm/data'\"",
      ),
    ).toEqual([])
  })
})

it.each([
  "import { crmCopy } from '@/modules/crm/crm.copy'",
  "import type { Row } from '#/modules/inventory/data'",
  "export * from '../../../../modules/crm/data'",
  "import '../../../demo/frontend/crm/data'",
])('keeps connector features independent of modules and other connectors: %s', (source) => {
  expect(violations('connectors/stripe/frontend/crm/feature.tsx', source)).toHaveLength(1)
})

it('allows connector-local files, core UI, contracts, and generated types', () => {
  const source =
    "import './data'; import '@/components/panel'; import '@/lib/modules/types'; import '@/generated/monospace'"

  expect(violations('connectors/stripe/frontend/crm/feature.tsx', source)).toEqual([])
})

it('checks routes a module owns outside its folder against manifest ownership', () => {
  const owners: RouteOwner[] = [
    { id: 'inventory', ownedPaths: ['modules/inventory', 'apps/web/src/routes/catalog.tsx'] },
    { id: 'sales', ownedPaths: ['modules/sales'] },
  ]

  for (const path of [
    'modules/inventory/routes/app/index.tsx',
    'apps/web/src/routes/catalog.tsx',
  ]) {
    expect(violations(path, "import '@/modules/inventory/data'", owners)).toEqual([])
    expect(violations(path, "import '@/modules/sales/data'", owners)).toHaveLength(1)
    expect(
      violations(path, "import '@/../../../connectors/demo/frontend/inventory/data'", owners),
    ).toHaveLength(1)
  }

  expect(
    violations('apps/web/src/routes/_app/index.tsx', "import '@/modules/inventory/data'", owners),
  ).toHaveLength(1)
  expect(
    violations('apps/web/src/routes/_app/settings.tsx', "import '@/lib/modules'", owners),
  ).toEqual([])
})

it.each([
  ['modules/crm/data.ts', "import '../../connectors/portal/frontend/crm/data'"],
  [
    'modules/crm/routes/app/organizations.tsx',
    "import '@/../../../connectors/portal/frontend/crm/feature'",
  ],
])('rejects Portal imports from CRM: %s', (path, source) => {
  expect(violations(path, source)).toHaveLength(1)
})
