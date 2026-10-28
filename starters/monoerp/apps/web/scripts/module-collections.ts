import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import * as manifestReader from '../../../infra/manifests.mjs'

const repository = new URL('../../../', import.meta.url)

try {
  loadEnvFile(new URL('../../../.env', import.meta.url))
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
}

// Installed modules, plus connector features whose module and connectors are all present and
// selected. `selected` defaults to OPTIONAL_SOURCES; tests pass it explicitly.
function discover(root: URL, selected: readonly string[] | undefined) {
  const manifests = manifestReader.readManifests(root)
  const modules = manifests.flatMap((manifest) => (manifest.kind === 'module' ? [manifest] : []))

  const connectors = manifests.flatMap((manifest) =>
    manifest.kind === 'connector' ? [manifest] : [],
  )

  const enabled = new Set(
    (
      selected ??
      manifestReader.selectConnectors(manifests, process.env.OPTIONAL_SOURCES).map(({ id }) => id)
    ).filter((id) => connectors.some((connector) => connector.id === id)),
  )

  const features = connectors.flatMap((connector) =>
    connector.frontend.map((feature) => ({ ...feature, connector: connector.id })),
  )

  const active = features.filter(
    (feature) =>
      modules.some((module) => module.id === feature.module) &&
      enabled.has(feature.connector) &&
      feature.requires.every((id) => enabled.has(id)),
  )

  for (const feature of active) {
    if (!existsSync(new URL(`${feature.path}/feature.tsx`, root)))
      throw new Error(`Selected frontend entry is missing: ${feature.path}/feature.tsx`)
  }

  return { modules, active, inactive: features.filter((feature) => !active.includes(feature)) }
}

export function readFrontendFeatures(root = repository, selected?: readonly string[]) {
  const { active, inactive } = discover(root, selected)

  return { active, inactive }
}

export function readModuleCollections(root = repository, selected?: readonly string[]) {
  const { modules, active } = discover(root, selected)

  return {
    appCollections: [...new Set([...modules, ...active].flatMap((config) => config.collections))],
    schemaCollections: [...new Set(modules.flatMap((module) => module.writes))],
  }
}

export const { appCollections, schemaCollections } = readModuleCollections()

export const frontendFeatures = readFrontendFeatures()

export function readModuleFeaturePaths(features = frontendFeatures.active) {
  const paths: Record<string, string[]> = {}

  for (const feature of features) (paths[feature.module] ??= []).push(feature.path)

  return paths
}

export const moduleFeaturePaths = readModuleFeaturePaths()
