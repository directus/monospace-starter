import moduleConfig from '../../../../../modules/crm/module.json'
import { Handshake, ListFilter } from 'lucide-react'

import { crmSearch } from '@/modules/crm/search'
import type { ModuleManifest } from '@/modules/types'
import { crmSettingsCopy } from '@/modules/crm/settings/settings.copy'
import { crmCopy } from '@/modules/crm/crm.copy'

declare module '@/modules/types' {
  interface ModuleRegistry {
    crm: true
  }
}

const crmModule: ModuleManifest = {
  id: 'crm',
  order: moduleConfig.order,
  label: crmCopy.module.label,
  description: crmCopy.module.description,
  icon: Handshake,
  basePath: '/crm',
  search: crmSearch,
  settings: {
    title: crmCopy.module.label,
    pages: [
      {
        title: crmSettingsCopy.stages.title,
        to: '/settings/crm/pipeline-stages',
        icon: ListFilter,
      },
    ],
  },
}

export default crmModule
