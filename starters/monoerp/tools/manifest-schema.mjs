import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9-]*$/)

const path = z
  .string()
  .refine(
    (value) =>
      !value.startsWith('/') &&
      value.trim() === value &&
      !value.includes(':') &&
      !Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32) &&
      !value.includes('\\') &&
      !value.includes('%') &&
      !value.includes('?') &&
      !value.includes('#') &&
      !value
        .split('/')
        .some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            part.toLowerCase() === '.git' ||
            part.toLowerCase() === 'node_modules',
        ),
    'Use a literal repository-relative path without traversal, URL punctuation or protected folders',
  )

const ids = z.array(id).refine((values) => new Set(values).size === values.length, 'Duplicate ids')

const names = z
  .array(z.string().min(1))
  .refine((values) => new Set(values).size === values.length, 'Duplicate names')

const collections = {
  order: z.number(),
  collections: names,
  schemas: names,
}

const step = z.strictObject({ title: z.string().min(1), script: path, requires: ids.optional() })

const setup = z.strictObject({ beforeSchema: z.array(step), afterSchema: z.array(step) })

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

const common = {
  id,
  label: z.string().min(1),
  description: z.string().min(1),
  ownedPaths: z.array(path).min(1),
  requires: ids.default([]),
  requiresWhenInstalled: z.record(id, ids).default({}),
  packageEntries: z
    .array(
      z.strictObject({
        path,
        section: z.enum(['scripts', 'dependencies', 'devDependencies', 'patchedDependencies']),
        names,
      }),
    )
    .optional(),
}

export const ownershipSchema = z.object(common)

const kinds = {
  'urn:monospace:manifest:starter:1': 'starter',
  'urn:monospace:manifest:module:1': 'module',
  'urn:monospace:manifest:connector:1': 'connector',
  'urn:monospace:manifest:deploy:1': 'deploy',
}

const runtimeCommon = { optional: ids.default([]) }

const when = z.literal('choices-changed').optional()

const nextStep = z.union([
  z.strictObject({ script: z.string().min(1), when }),
  z.strictObject({ command: z.array(z.string().min(1)).min(1), when }),
])

const moduleRuntime = z.strictObject({
  ...runtimeCommon,
  ...collections,
  demoUserCredential: z.string().min(1).optional(),
  app: path,
  infra: path,
  settings: z.array(path),
  auditTables: z.record(z.string(), names),
  setup,
  schemaFiles: z.array(path),
  compose: path.optional(),
  composeProfiles: z.record(id, path).optional(),
})

const connectorRuntime = z.strictObject({
  ...runtimeCommon,
  compose: path.optional(),
  composeProfiles: z.record(id, path).optional(),
  source: z
    .record(z.string(), sourceValue)
    .refine(
      (value) => !Object.hasOwn(value, 'env') && !Object.hasOwn(value, 'when'),
      'Invalid source directive',
    ),
  schemaFiles: z.array(path),
  setup,
  extension: z
    .strictObject({ directory: path, installed: z.string().regex(/^[a-z][a-z0-9_]*$/) })
    .optional(),
  migrate: path.optional(),
  provision: path.optional(),
  frontend: z.array(z.strictObject({ ...collections, module: id, slot: id, path })).optional(),
})

export const manifestSchema = z
  .discriminatedUnion('format', [
    z.strictObject({
      ...common,
      id: z.literal('starter'),
      format: z.literal('urn:monospace:manifest:starter:1'),
      sourceRoots: z.array(path),
      ignorePaths: z.array(path).default([]),
      nextSteps: z.strictObject({ create: z.array(nextStep), remove: z.array(nextStep) }),
      'x-monoerp': z.strictObject(runtimeCommon).optional(),
    }),
    z.strictObject({
      ...common,
      format: z.literal('urn:monospace:manifest:deploy:1'),
      'x-monoerp': z.strictObject({ lint: path.optional() }).optional(),
    }),
    z.strictObject({
      ...common,
      format: z.literal('urn:monospace:manifest:module:1'),
      'x-monoerp': moduleRuntime,
    }),
    z.strictObject({
      ...common,
      format: z.literal('urn:monospace:manifest:connector:1'),
      'x-monoerp': connectorRuntime,
    }),
  ])
  .transform((document) => {
    const { 'x-monoerp': runtime = {}, ...envelope } = document
    const manifest = { ...envelope, ...runtime, kind: kinds[envelope.format] }

    if (manifest.kind === 'connector')
      manifest.frontend = (runtime.frontend ?? []).map((feature) => ({
        ...feature,
        requires: envelope.requiresWhenInstalled[feature.module] ?? [],
      }))

    return manifest
  })
  .superRefine((manifest, context) => {
    const configs =
      manifest.kind === 'module'
        ? [manifest]
        : manifest.kind === 'connector'
          ? (manifest.frontend ?? [])
          : []

    for (const config of configs) {
      const missing = config.schemas.filter((name) => !config.collections.includes(name))

      if (missing.length)
        context.addIssue({
          code: 'custom',
          message: `schemas missing from collections: ${missing.join(', ')}`,
        })
    }

    if (manifest.requires.some((dependency) => (manifest.optional ?? []).includes(dependency)))
      context.addIssue({
        code: 'custom',
        message: 'A dependency cannot be both required and optional',
      })
  })
