import type { ModuleId, ModuleManifest } from '@/modules/types'

export type {
  ModuleId,
  ModuleManifest,
  PageMeta,
  RoutePath,
  SearchHit,
  SearchScope,
} from '@/modules/types'

const manifests = import.meta.glob<{ default: ModuleManifest }>('./*/module.ts', { eager: true })

export const modules = Object.values(manifests)
  .map((manifest) => manifest.default)
  .sort((left, right) => left.order - right.order)

export function moduleById(id: ModuleId | undefined) {
  return modules.find((module) => module.id === id)
}
