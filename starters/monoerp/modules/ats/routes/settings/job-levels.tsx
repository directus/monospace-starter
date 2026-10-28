import { createFileRoute } from '@tanstack/react-router'
import { Layers } from 'lucide-react'

import { JobLevelsSettings } from '@/modules/ats/settings/ats-job-levels'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/ats/job-levels')({
  staticData: {
    page: {
      title: atsSettingsCopy.jobLevels.title,
      icon: Layers,
      parent: '/settings',
      keywords: atsSettingsCopy.jobLevels.keywords,
    },
  },
  component: JobLevelsSettings,
})
