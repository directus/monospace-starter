import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { z } from 'zod'

const piecesModule = await import(new URL('../../../infra/pieces.mjs', import.meta.url).href)

const repository = new URL('../../../', import.meta.url)

try {
  loadEnvFile(new URL('../../../.env', import.meta.url))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}

const collectionConfig = z
  .object({ order: z.number(), collections: z.array(z.string()), schemas: z.array(z.string()) })
  .superRefine((config, context) => {
    const missing = config.schemas.filter((name) => !config.collections.includes(name))

    if (missing.length)
      context.addIssue({
        code: 'custom',
        message: `schemas missing from collections: ${missing.join(', ')}`,
      })
  })

const featureConfig = z.object({
  module: z.string(),
  slot: z.string(),
  connector: z.string(),
  path: z.string(),
  requires: z.array(z.string()),
  order: z.number(),
  collections: z.array(z.string()),
  schemas: z.array(z.string()),
})

const piecesConfig = z.array(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('core'), id: z.string() }),
    z.object({
      kind: z.literal('module'),
      id: z.string(),
      app: z.string(),
      requires: z.array(z.string()),
      optional: z.array(z.string()),
      order: z.number(),
      collections: z.array(z.string()),
      schemas: z.array(z.string()),
    }),
    z.object({
      kind: z.literal('connector'),
      id: z.string(),
      frontend: z.array(featureConfig.omit({ connector: true })).optional(),
    }),
  ]),
)

function readPieces(root: URL) {
  return piecesConfig.parse(piecesModule.readPieces(root))
}

function selectedConnectorIds(root: URL, override: string | undefined) {
  return z
    .array(z.object({ id: z.string() }))
    .parse(piecesModule.selectConnectors(readPieces(root), override))
    .map(({ id }) => id)
}

export function readFrontendFeatures(
  root = repository,
  selected = selectedConnectorIds(root, process.env.OPTIONAL_SOURCES),
) {
  const pieces = readPieces(root)

  const installed = new Set(
    pieces.flatMap((piece) =>
      piece.kind === 'module' && existsSync(new URL(`${piece.app}/`, root)) ? [piece.id] : [],
    ),
  )

  const enabled = (id: string) =>
    selected.includes(id) && pieces.some((piece) => piece.kind === 'connector' && piece.id === id)

  const features = pieces
    .flatMap((piece) =>
      piece.kind === 'connector'
        ? (piece.frontend ?? []).map((feature) =>
            featureConfig.parse({ ...feature, connector: piece.id }),
          )
        : [],
    )
    .sort((left, right) => left.order - right.order)

  const active = features.filter(
    (feature) =>
      installed.has(feature.module) &&
      enabled(feature.connector) &&
      feature.requires.every(enabled),
  )

  for (const feature of active) {
    if (feature.path !== `connectors/${feature.connector}/frontend/${feature.module}`)
      throw new Error(`${feature.path}: feature path must match its connector and target module`)

    if (!existsSync(new URL(`${feature.path}/feature.tsx`, root)))
      throw new Error(`Selected frontend entry is missing: ${feature.path}/feature.tsx`)
  }

  const inactive = features.filter((feature) => !active.includes(feature))

  return { active, inactive }
}

export function readModuleCollections(
  root = repository,
  selected = selectedConnectorIds(root, process.env.OPTIONAL_SOURCES),
) {
  const configs = readPieces(root).flatMap((piece) =>
    piece.kind === 'module' ? [collectionConfig.parse(piece)] : [],
  )

  configs.push(
    ...readFrontendFeatures(root, selected).active.map((feature) =>
      collectionConfig.parse(feature),
    ),
  )
  configs.sort((left, right) => left.order - right.order)

  return {
    appCollections: [...new Set(configs.flatMap((config) => config.collections))],
    schemaCollections: [...new Set(configs.flatMap((config) => config.schemas))],
  }
}

export const { appCollections, schemaCollections } = readModuleCollections()

export const frontendFeatures = readFrontendFeatures()

export function readOrganizationPanelPaths(features = frontendFeatures.active) {
  return features.flatMap((feature) =>
    feature.module === 'crm' && feature.slot === 'organization-panel' ? [feature.path] : [],
  )
}

export const organizationPanelPaths = readOrganizationPanelPaths()
