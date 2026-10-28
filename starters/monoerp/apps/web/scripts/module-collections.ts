import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import * as manifestReader from '../../../infra/manifests.mjs'

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
    manifests.flatMap((manifest) => (manifest.kind === 'module' ? [manifest.id] : [])),
  )

  const enabled = (id: string) =>
    selected.includes(id) &&
    manifests.some((manifest) => manifest.kind === 'connector' && manifest.id === id)

  const features = manifests.flatMap((manifest) =>
    manifest.kind === 'connector'
      ? manifest.frontend.map((feature) => ({ ...feature, connector: manifest.id }))
      : [],
  )

  const active = features.filter(
    (feature) =>
      installed.has(feature.module) &&
      enabled(feature.connector) &&
      feature.requires.every(enabled),
  )

  for (const feature of active) {
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
  const modules = manifestReader
    .readManifests(root)
    .flatMap((manifest) => (manifest.kind === 'module' ? [manifest] : []))

  const features = readFrontendFeatures(root, selected).active

  return {
    appCollections: [...new Set([...modules, ...features].flatMap((config) => config.collections))],
    schemaCollections: [...new Set(modules.flatMap((module) => module.writes))],
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
