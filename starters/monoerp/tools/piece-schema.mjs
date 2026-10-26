import { z } from 'zod'

const id = z.string().regex(/^[a-z][a-z0-9-]*$/)

const path = z
  .string()
  .regex(/^[a-zA-Z0-9_.$/-]+$/)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('%') &&
      !value
        .split('/')
        .some(
          (part) =>
            !part || part === '.' || part === '..' || part === '.git' || part === 'node_modules',
        ),
    'Use a literal repository-relative path without traversal or protected directories',
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
  requires: ids,
  optional: ids,
  packageEntries: z
    .array(
      z.strictObject({
        path,
        section: z.enum(['scripts', 'dependencies', 'devDependencies']),
        names,
      }),
    )
    .optional(),
}

export const pieceSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...common, kind: z.literal('core'), id: z.literal('core') }),
    z.strictObject({ ...common, kind: z.literal('tooling') }),
    z.strictObject({
      ...common,
      ...collections,
      kind: z.literal('module'),
      demoUserCredential: z.string().min(1).optional(),
      app: path,
      infra: path,
      settings: z.array(path),
      auditTables: z.record(z.string(), names),
      setup,
      schemaFiles: z.array(path),
      compose: path.optional(),
      composeProfiles: z.record(id, path).optional(),
    }),
    z.strictObject({
      ...common,
      kind: z.literal('connector'),
      provides: names,
      env: z.array(env),
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
      frontend: z
        .array(z.strictObject({ ...collections, module: id, slot: id, path, requires: ids }))
        .optional(),
    }),
  ])
  .superRefine((piece, context) => {
    const configs =
      piece.kind === 'module' ? [piece] : piece.kind === 'connector' ? (piece.frontend ?? []) : []

    for (const config of configs) {
      const missing = config.schemas.filter((name) => !config.collections.includes(name))

      if (missing.length)
        context.addIssue({
          code: 'custom',
          message: `schemas missing from collections: ${missing.join(', ')}`,
        })
    }

    if (piece.requires.some((dependency) => piece.optional.includes(dependency))) {
      context.addIssue({
        code: 'custom',
        message: 'A dependency cannot be both required and optional',
      })
    }
  })
