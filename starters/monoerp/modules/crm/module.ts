import { Handshake } from 'lucide-react'

import { settingsPaths } from '@/lib/module-settings'
import type { ModuleEntry } from '@/lib/modules/types'
import { crmCopy } from '@/modules/crm/crm.copy'
import { crmSearch } from '@/modules/crm/search'

import moduleConfig from './module.json'

declare module '@/lib/modules/types' {
  interface ModuleRegistry {
    crm: true
  }
}

const crmModule: ModuleEntry = {
  id: 'crm',
  order: moduleConfig['x-monoerp'].order,
  label: crmCopy.module.label,
  description: crmCopy.module.description,
  icon: Handshake,
  basePath: '/crm',
  search: crmSearch,
  settings: {
    title: crmCopy.module.label,
    pages: settingsPaths(moduleConfig['x-monoerp'].settings),
  },
}

export default crmModule
