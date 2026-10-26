import { createFileRoute } from '@tanstack/react-router'
import { ListFilter } from 'lucide-react'

import { PipelineStagesSettings } from '@/modules/crm/settings/pipeline-stages'
import { crmSettingsCopy } from '@/modules/crm/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/crm/pipeline-stages')({
  staticData: {
    page: {
      title: crmSettingsCopy.stages.title,
      icon: ListFilter,
      parent: '/settings',
      keywords: ['settings', 'pipeline', 'stages', 'sales'],
    },
  },
  component: PipelineStagesSettings,
})
