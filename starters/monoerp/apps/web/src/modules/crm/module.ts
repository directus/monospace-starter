import { Handshake } from 'lucide-react'

import { settingsPaths } from '@/lib/module-settings'
import { crmCopy } from '@/modules/crm/crm.copy'
import { crmSearch } from '@/modules/crm/search'
import type { ModuleManifest } from '@/modules/types'

import moduleConfig from '../../../../../modules/crm/module.json'

declare module '@/modules/types' {
  interface ModuleRegistry {
    crm: true
  }
}

const crmModule: ModuleManifest = {
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
