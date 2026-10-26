import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { z } from 'zod'

const manifestReader = await import(new URL('../../../infra/manifests.mjs', import.meta.url).href)

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

const manifestConfigs = z.array(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('starter'), id: z.string() }),
    z.object({ kind: z.literal('workshop'), id: z.string() }),
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

function readManifests(root: URL) {
  return manifestConfigs.parse(manifestReader.readManifests(root))
}

function selectedConnectorIds(root: URL, override: string | undefined) {
  return z
    .array(z.object({ id: z.string() }))
    .parse(manifestReader.selectConnectors(readManifests(root), override))
    .map(({ id }) => id)
}

export function readFrontendFeatures(
  root = repository,
  selected = selectedConnectorIds(root, process.env.OPTIONAL_SOURCES),
) {
  const manifests = readManifests(root)

  const installed = new Set(
    manifests.flatMap((manifest) =>
      manifest.kind === 'module' && existsSync(new URL(`${manifest.app}/`, root))
        ? [manifest.id]
        : [],
    ),
  )

  const enabled = (id: string) =>
    selected.includes(id) &&
    manifests.some((manifest) => manifest.kind === 'connector' && manifest.id === id)

  const features = manifests
    .flatMap((manifest) =>
      manifest.kind === 'connector'
        ? (manifest.frontend ?? []).map((feature) =>
            featureConfig.parse({ ...feature, connector: manifest.id }),
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

  const disabled = new Set(
    inactive.flatMap((feature) =>
      installed.has(feature.module)
        ? [feature.connector, ...feature.requires].filter(
            (id) =>
              !selected.includes(id) &&
              manifests.some((manifest) => manifest.kind === 'connector' && manifest.id === id),
          )
        : [],
    ),
  )

  if (process.env.OPTIONAL_SOURCES !== undefined) {
    for (const id of disabled) console.log(`${id}: skipped, disabled in OPTIONAL_SOURCES`)
  }

  return { active, inactive }
}

export function readModuleCollections(
  root = repository,
  selected = selectedConnectorIds(root, process.env.OPTIONAL_SOURCES),
) {
  const configs = readManifests(root).flatMap((manifest) =>
    manifest.kind === 'module' ? [collectionConfig.parse(manifest)] : [],
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
