import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { z } from 'zod'

import { schemaCollections } from './module-collections.ts'

const OPERATIONS = ['create', 'update'] as const

const scriptDirectory = dirname(fileURLToPath(import.meta.url))

export const webDirectory = resolve(scriptDirectory, '..')

export const repositoryDirectory = resolve(webDirectory, '../..')

const outputPath = resolve(webDirectory, 'src/generated/monospace/schemas.ts')

const json = z.json()

export type JsonValue = z.infer<typeof json>

export type JsonObject = { [key: string]: JsonValue }

const jsonObject = z.record(z.string(), json)

const reference = z.object({ $ref: z.string() }).catchall(json)

export const refPath = z.string()

// Shallow: tells a JSON object apart from arrays and scalars without re-checking its children.
const anyObject = z.looseObject({})

// A collection endpoint's JSON request body, for one item or a list of them.
const jsonRequest = z.object({
  requestBody: z.object({
    content: z.object({
      'application/json': z.object({
        schema: z.union([
          z.object({ $ref: refPath }),
          z.object({ items: z.object({ $ref: refPath }) }),
        ]),
      }),
    }),
  }),
})

const propertyNames = z.array(z.string())

// The parts of Monospace's OpenAPI document these scripts read. Everything else passes through
// as JSON, so a pruned copy written back out is still a complete document.
export const openApiDocument = z
  .object({
    components: z
      .object({ schemas: z.record(z.string(), jsonObject).optional() })
      .catchall(json)
      .optional(),
    paths: z.record(z.string(), jsonObject).optional(),
    'x-monospace-mappings': z
      .record(
        z.string(),
        z.object({ many: reference.optional(), one: reference.optional() }).catchall(json),
      )
      .optional(),
  })
  .catchall(json)

export type OpenApiDocument = z.infer<typeof openApiDocument>

const authProviders = z.object({
  data: z
    .array(
      z.object({
        apiName: z.string(),
        loginMethod: z.string(),
        loginPath: z.string(),
        protocol: z.string(),
      }),
    )
    .optional(),
})

type Operation = (typeof OPERATIONS)[number]

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return anyObject.safeParse(value).success
}

function decodeJsonPointer(value: string) {
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
}

function componentNameFromRef(reference: string) {
  if (!reference.startsWith('#/components/schemas/')) {
    throw new Error(`Expected a local component schema reference, received ${reference}`)
  }

  return decodeJsonPointer(reference.slice('#/components/schemas/'.length))
}

function requestComponentName(document: OpenApiDocument, collection: string, operation: Operation) {
  const mapping = document['x-monospace-mappings']?.[collection]?.many

  if (!mapping) throw new Error(`Collection ${collection} has no collection endpoint mapping`)

  const pathName = decodeJsonPointer(mapping.$ref.replace('#/paths/', ''))
  const path = document.paths?.[pathName]

  if (!path) throw new Error(`Collection endpoint ${pathName} is missing`)

  const method = operation === 'create' ? 'post' : 'patch'
  const methodDefinition = path[method]

  if (!methodDefinition) throw new Error(`Collection ${collection} does not support ${operation}`)

  const request = jsonRequest.safeParse(methodDefinition)

  if (!request.success) {
    throw new Error(
      `${collection} ${operation} has no JSON request schema reference\n${z.prettifyError(request.error)}`,
    )
  }

  const { schema } = request.data.requestBody.content['application/json']

  return componentNameFromRef('items' in schema ? schema.items.$ref : schema.$ref)
}

// Nested writes through Monospace's own collections (a record's `owner` or `createdBy` user,
// and from there every collection with a user relation) aren't something the app sends. The
// app sets the id column instead. Following them pulls in every collection's inputs, and
// z.fromJSONSchema overflows the stack on that graph, so they're accepted as-is.
function isSystemComponent(name: string) {
  return name.startsWith('MonospaceSystem') || name.startsWith('MonospaceRole')
}

function referencedComponents(value: JsonValue | undefined, references: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) referencedComponents(item, references)

    return
  }

  if (!isObject(value)) return

  for (const [key, child] of Object.entries(value)) {
    const ref = key === '$ref' ? refPath.safeParse(child) : undefined

    if (ref?.success) {
      const name = componentNameFromRef(ref.data)

      if (!isSystemComponent(name)) references.add(name)
    } else {
      referencedComponents(child, references)
    }
  }
}

function reachableDefinitions(document: OpenApiDocument, roots: readonly string[]) {
  const schemas = document.components?.schemas

  if (!schemas) throw new Error('OpenAPI components.schemas is missing')

  const pending = [...roots]
  const names = new Set<string>()

  while (pending.length > 0) {
    const name = pending.pop()

    if (!name || names.has(name)) continue

    const schema = schemas[name]

    if (schema === undefined) throw new Error(`Referenced component ${name} is missing`)

    names.add(name)
    const references = new Set<string>()
    referencedComponents(schema, references)
    pending.push(...references)
  }

  return Object.fromEntries(
    [...names]
      .sort((left, right) => left.localeCompare(right))
      .map((name) => [name, rewriteReferences(schemas[name])]),
  )
}

// Also sorts `required` lists: the engine emits them in no fixed order, and a regenerate
// should be a no-op diff when nothing changed.
function rewriteReferences(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(rewriteReferences)

  if (!isObject(value)) return value

  const ref = refPath.safeParse(value.$ref)

  if (ref.success && isSystemComponent(componentNameFromRef(ref.data))) return {}

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      const ref = key === '$ref' ? refPath.safeParse(child) : undefined

      if (ref?.success) return [key, ref.data.replace('#/components/schemas/', '#/$defs/')]

      const names = key === 'required' ? propertyNames.safeParse(child) : undefined

      if (names?.success) return [key, names.data.sort((left, right) => left.localeCompare(right))]

      return [key, rewriteReferences(child)]
    }),
  )
}

function schemaExportName(collection: string, operation: Operation) {
  return `${collection}${operation === 'create' ? 'Create' : 'Update'}Schema`
}

function inputTypeName(collection: string, operation: Operation) {
  return `${collection}${operation === 'create' ? 'Create' : 'Update'}OneInput`
}

export function generateZodSchemaSource(
  document: OpenApiDocument,
  collections: readonly string[] = schemaCollections,
) {
  if (collections.length === 0)
    return '// Generated from the Monospace OpenAPI document. No write collections installed.\nexport {}\n'

  const inputs = collections.flatMap((collection) =>
    OPERATIONS.map((operation) => ({
      collection,
      operation,
      component: requestComponentName(document, collection, operation),
      exportName: schemaExportName(collection, operation),
      typeName: inputTypeName(collection, operation),
    })),
  )

  const definitions = reachableDefinitions(
    document,
    inputs.map(({ component }) => component),
  )

  const typeNames = inputs.map(({ typeName }) => typeName).sort()

  const exports = inputs
    .map(
      ({ component, exportName, typeName }) =>
        `export const ${exportName} = fromComponent<${typeName}>('${component}')`,
    )
    .join('\n')

  return `// THIS FILE IS AUTOGENERATED - DO NOT EDIT MANUALLY
// Generated from the Monospace OpenAPI document using Zod

/* eslint-disable */

import * as z from 'zod'
import type { ${typeNames.join(', ')} } from './index'

const definitions = ${JSON.stringify(definitions, null, 2)} as const

type JsonSchema = Parameters<typeof z.fromJSONSchema>[0]

function fromComponent<T>(component: string): z.ZodType<T> {
  return z.fromJSONSchema({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: \`#/$defs/\${component}\`,
    $defs: definitions,
  } as unknown as JsonSchema) as z.ZodType<T>
}

${exports}

/* eslint-enable */
`
}

async function requestJson<T>(schema: z.ZodType<T>, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(
      `${init?.method ?? 'GET'} ${url} returned ${response.status}: ${await response.text()}`,
    )
  }

  return schema.parse(await response.json())
}

export async function fetchOpenApiDocument(): Promise<OpenApiDocument> {
  const input = process.env.MONOSPACE_OPENAPI_PATH

  if (input) {
    return openApiDocument.parse(
      JSON.parse(await readFile(resolve(repositoryDirectory, input), 'utf8')),
    )
  }

  const port = process.env.MONOSPACE_PORT ?? '8100'
  const baseUrl = (process.env.MONOSPACE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, '')
  const workspace = process.env.MONOSPACE_WORKSPACE ?? 'crm'
  const headers = new Headers({ accept: 'application/json' })
  const apiKey = process.env.MONOSPACE_API_KEY

  if (apiKey) {
    headers.set('authorization', `Bearer ${apiKey}`)
  } else {
    const providers = await requestJson(authProviders, `${baseUrl}/api/auth/providers`, {
      headers,
    })

    const provider = providers.data?.find(
      (candidate) => candidate.protocol === 'password' && candidate.loginMethod === 'POST',
    )

    if (!provider) throw new Error('No password authentication provider is available')

    const loginResponse = await fetch(
      `${baseUrl}/api/auth/providers/${encodeURIComponent(provider.apiName)}${provider.loginPath}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: process.env.MONOSPACE_ADMIN_EMAIL ?? 'admin@example.com',
          password: process.env.MONOSPACE_ADMIN_PASSWORD ?? 'monospace',
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!loginResponse.ok) {
      throw new Error(
        `Monospace login returned ${loginResponse.status}: ${await loginResponse.text()}`,
      )
    }

    const cookies = loginResponse.headers.getSetCookie()

    if (cookies.length === 0) throw new Error('Monospace login did not return a session cookie')
    headers.set('cookie', cookies.map((cookie) => cookie.split(';', 1)[0]).join('; '))
  }

  return requestJson(openApiDocument, `${baseUrl}/api/${encodeURIComponent(workspace)}/openapi`, {
    headers,
  })
}

async function main() {
  const envPath = resolve(repositoryDirectory, '.env')

  if (existsSync(envPath)) loadEnvFile(envPath)

  const document = await fetchOpenApiDocument()
  const source = generateZodSchemaSource(document)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, source, 'utf8')
  console.log(`Generated ${outputPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
