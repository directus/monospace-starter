import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const schema = 'https://monospace.io/schemas/starter/v1/catalog.json'

const parts = [
  { kind: 'modules', manifest: 'module.json' },
  { kind: 'connectors', manifest: 'connector.json' },
  { kind: 'deploy', manifest: 'deploy.json' },
]

function folders(dir) {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

// Only the envelope's label and description, so slimmer manifests keep working.
function describe(root, file) {
  const path = relative(root, file)

  if (!existsSync(file)) throw new Error(`${path} is missing`)
  const { label, description } = JSON.parse(readFileSync(file, 'utf8'))

  for (const [key, value] of Object.entries({ label, description })) {
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`${path}: ${key} must be a non-empty string`)
  }

  return { label, description }
}

// Releases tag <name>@<version>, so the package name must match the folder.
function version(root, path, id) {
  const file = join(root, path, 'package.json')

  if (!existsSync(file)) throw new Error(`${path}/package.json is missing`)
  const { name, version } = JSON.parse(readFileSync(file, 'utf8'))

  if (name !== id) throw new Error(`${path}/package.json: name must be "${id}"`)
  if (typeof version !== 'string' || !version.trim())
    throw new Error(`${path}/package.json: version must be a non-empty string`)

  return version
}

export function buildCatalog(root) {
  return {
    $schema: schema,
    starters: folders(join(root, 'starters')).map((id) => {
      const path = `starters/${id}`

      return {
        id,
        path,
        version: version(root, path, id),
        ...describe(root, join(root, path, 'starter.json')),
        ...Object.fromEntries(
          parts.map(({ kind, manifest }) => [
            kind,
            folders(join(root, path, kind)).map((part) => ({
              id: part,
              ...describe(root, join(root, path, kind, part, manifest)),
            })),
          ]),
        ),
      }
    }),
  }
}

// Every starter README has these sections, in any order (CONTRIBUTING.md).
export const readmeHeadings = [
  "What's inside",
  'Quickstart',
  'Everyday commands',
  'Project layout',
  'Removing parts',
  'Deploy',
  'Docs',
  'License',
]

export function checkReadme(root, path) {
  const file = join(root, path, 'README.md')

  if (!existsSync(file)) throw new Error(`${path}/README.md is missing`)

  const headings = readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => (line.startsWith('## ') ? [line.slice(3).trim()] : []))

  const missing = readmeHeadings.filter((heading) => !headings.includes(heading))

  if (missing.length)
    throw new Error(
      `${path}/README.md is missing ${missing.map((heading) => `"## ${heading}"`).join(', ')}; see CONTRIBUTING.md`,
    )
}

export function render(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)

    if (args.length > 1 || (args.length && args[0] !== '--check'))
      throw new Error('Usage: node tooling/catalog.mjs [--check]')
    const root = fileURLToPath(new URL('..', import.meta.url))
    const file = join(root, 'catalog.json')
    const expected = render(buildCatalog(root))

    if (args[0] === '--check') {
      if (!existsSync(file) || readFileSync(file, 'utf8') !== expected)
        throw new Error(
          'catalog.json is stale. Run node tooling/catalog.mjs and commit the result.',
        )

      for (const starter of folders(join(root, 'starters'))) checkReadme(root, `starters/${starter}`)
      console.log('catalog.json is up to date')
    } else {
      writeFileSync(file, expected)
      console.log('Wrote catalog.json')
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
