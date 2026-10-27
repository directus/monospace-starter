import type { ModuleId, ModuleEntry } from '@/modules/types'

export type { ModuleId, ModuleEntry, SearchHit, SearchScope } from '@/modules/types'

const manifests = import.meta.glob<{ default: ModuleEntry }>('./*/module.ts', { eager: true })

export const modules = Object.values(manifests)
  .map((manifest) => manifest.default)
  .sort((left, right) => left.order - right.order)

export function moduleById(id?: ModuleId) {
  return modules.find((module) => module.id === id)
}
