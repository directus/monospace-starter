import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'

import { DepartmentsSettings } from '@/modules/ats/settings/ats-departments'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/ats/departments')({
  staticData: {
    page: {
      title: atsSettingsCopy.departments.title,
      icon: Building2,
      parent: '/settings',
      keywords: atsSettingsCopy.departments.keywords,
    },
  },
  component: DepartmentsSettings,
})
