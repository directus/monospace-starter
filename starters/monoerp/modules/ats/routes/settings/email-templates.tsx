import { createFileRoute } from '@tanstack/react-router'
import { Mail } from 'lucide-react'

import { EmailTemplatesSettings } from '@/modules/ats/settings/ats-email-templates'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/ats/email-templates')({
  staticData: {
    page: {
      title: atsSettingsCopy.emailTemplates.title,
      icon: Mail,
      parent: '/settings',
      keywords: atsSettingsCopy.emailTemplates.keywords,
    },
  },
  component: EmailTemplatesSettings,
})
