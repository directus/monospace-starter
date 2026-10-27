import moduleConfig from '../../../../../modules/crm/module.json'
import { Handshake } from 'lucide-react'

import { crmSearch } from '@/modules/crm/search'
import type { ModuleManifest } from '@/modules/types'
import { crmCopy } from '@/modules/crm/crm.copy'

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
    pages: ['/settings/crm/pipeline-stages'],
  },
}

export default crmModule
