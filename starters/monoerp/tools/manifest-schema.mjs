import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9-]*$/)

export const path = z
  .string()
  .refine(
    (value) =>
      !value.startsWith('/') &&
      value.trim() === value &&
      !/[:%?#\\]/.test(value) &&
      !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32) &&
      !value
        .split('/')
        .some((part) => ['', '.', '..', '.git', 'node_modules'].includes(part.toLowerCase())),
    'Use a literal repository-relative path without traversal, URL punctuation or protected folders',
  )

const ids = z.array(id).refine((values) => new Set(values).size === values.length, 'Duplicate ids')

const names = z
  .array(z.string().min(1))
  .refine((values) => new Set(values).size === values.length, 'Duplicate names')

const step = z.strictObject({
  title: z.string().min(1),
  script: z.string().regex(/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*\.mjs$/),
  requires: ids.optional(),
})

const setup = z
  .strictObject({ beforeSchema: z.array(step).default([]), afterSchema: z.array(step).default([]) })
  .default({ beforeSchema: [], afterSchema: [] })

const env = z.string().regex(/^[A-Z][A-Z0-9_]*$/)

const scalar = z.union([z.string(), z.number(), z.boolean()])

const sourceValue = z.lazy(() =>
  z.union([
    scalar,
    z.strictObject({ env, default: scalar.optional(), emptyUsesDefault: z.boolean().optional() }),
    z.strictObject({ when: env, value: sourceValue, otherwise: sourceValue.optional() }),
    z
      .record(z.string(), sourceValue)
      .refine(
        (value) => !Object.hasOwn(value, 'env') && !Object.hasOwn(value, 'when'),
        'Invalid source directive',
      ),
  ]),
)

export const schemaUrl = (kind) => `https://monospace.io/schemas/starter/v1/${kind}.json`

// The CLI envelope. Id and kind come from the manifest's location, never from the file.
const envelope = (kind) => ({
  $schema: z.literal(schemaUrl(kind)),
  label: z.string().min(1),
  description: z.string().min(1),
  requires: ids.default([]),
  alsoOwns: z
    .array(path)
    .refine((values) => new Set(values).size === values.length, 'Duplicate paths')
    .default([]),
  packageEntries: z
    .array(
      z.strictObject({
        file: path,
        section: z.enum(['scripts', 'dependencies', 'devDependencies', 'patchedDependencies']),
        entries: z.record(z.string().min(1), z.string()),
      }),
    )
    .default([]),
})

const when = z.literal('choices-changed').optional()

const nextStep = z.union([
  z.strictObject({ script: z.string().min(1), when }),
  z.strictObject({ command: z.array(z.string().min(1)).min(1), when }),
])

const moduleRuntime = z
  .strictObject({
    collections: names,
    writes: names.default([]),
    auditColumns: z.record(z.string(), names).default({}),
    setup,
    demoUserCredential: env.optional(),
  })
  .superRefine((runtime, context) => {
    const missing = runtime.writes.filter((name) => !runtime.collections.includes(name))

    if (missing.length)
      context.addIssue({
        code: 'custom',
        message: `writes missing from collections: ${missing.join(', ')}`,
      })
  })

const connectorRuntime = z.strictObject({
  source: z
    .record(z.string(), sourceValue)
    .refine(
      (value) => !Object.hasOwn(value, 'env') && !Object.hasOwn(value, 'when'),
      'Invalid source directive',
    ),
  setup,
  contributes: z
    .record(id, z.strictObject({ requires: ids.default([]), collections: names.default([]) }))
    .default({}),
})

export const manifestSchemas = {
  starter: z.strictObject({
    $schema: z.literal(schemaUrl('starter')),
    label: z.string().min(1),
    description: z.string().min(1),
    ignorePaths: z.array(path).default([]),
    nextSteps: z.strictObject({ create: z.array(nextStep), remove: z.array(nextStep) }),
  }),
  module: z.strictObject({ ...envelope('module'), 'x-monoerp': moduleRuntime }),
  connector: z.strictObject({ ...envelope('connector'), 'x-monoerp': connectorRuntime }),
  deploy: z.strictObject(envelope('deploy')),
}
