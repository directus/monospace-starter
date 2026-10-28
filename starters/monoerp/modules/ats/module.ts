import { BriefcaseBusiness } from 'lucide-react'

import type { ModuleEntry } from '@/lib/modules/types'
import { atsCopy } from '@/modules/ats/ats.copy'
import { atsSearch } from '@/modules/ats/search'

declare module '@/lib/modules/types' {
  interface ModuleRegistry {
    ats: true
  }
}

const atsModule: ModuleEntry = {
  id: 'ats',
  order: 20,
  label: atsCopy.module.label,
  description: atsCopy.module.description,
  icon: BriefcaseBusiness,
  basePath: '/ats',
  search: atsSearch,
}

export default atsModule
