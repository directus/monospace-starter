import { Handshake } from 'lucide-react'

import type { ModuleEntry } from '@/lib/modules/types'
import { crmCopy } from '@/modules/crm/crm.copy'
import { crmSearch } from '@/modules/crm/search'

declare module '@/lib/modules/types' {
  interface ModuleRegistry {
    crm: true
  }
}

const crmModule: ModuleEntry = {
  id: 'crm',
  order: 10,
  label: crmCopy.module.label,
  description: crmCopy.module.description,
  icon: Handshake,
  basePath: '/crm',
  search: crmSearch,
}

export default crmModule
