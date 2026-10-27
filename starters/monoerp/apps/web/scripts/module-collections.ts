import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import * as manifestReader from '../../../infra/manifests.mjs'
import type { Collections } from '../../../infra/manifests.mjs'

const repository = new URL('../../../', import.meta.url)

try {
  loadEnvFile(new URL('../../../.env', import.meta.url))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}

function selectedConnectorIds(root: URL, override: string | undefined) {
  return manifestReader
    .selectConnectors(manifestReader.readManifests(root), override)
    .map(({ id }) => id)
}

export function readFrontendFeatures(
  root = repository,
  selected = selectedConnectorIds(root, process.env.OPTIONAL_SOURCES),
) {
  const manifests = manifestReader.readManifests(root)

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
        ? (manifest.frontend ?? []).map((feature) => ({ ...feature, connector: manifest.id }))
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
  const configs: Collections[] = manifestReader
    .readManifests(root)
    .flatMap((manifest) => (manifest.kind === 'module' ? [manifest] : []))

  configs.push(...readFrontendFeatures(root, selected).active)
  configs.sort((left, right) => left.order - right.order)

  return {
    appCollections: [...new Set(configs.flatMap((config) => config.collections))],
    schemaCollections: [...new Set(configs.flatMap((config) => config.schemas))],
  }
}

export const { appCollections, schemaCollections } = readModuleCollections()

export const frontendFeatures = readFrontendFeatures()

export function readModuleFeaturePaths(features = frontendFeatures.active) {
  const paths: Record<string, string[]> = {}

  for (const feature of features) {
    const selected = (paths[feature.module] ??= [])

    if (!selected.includes(feature.path)) selected.push(feature.path)
  }

  return paths
}

export const moduleFeaturePaths = readModuleFeaturePaths()
