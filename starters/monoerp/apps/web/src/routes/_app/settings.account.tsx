import { createFileRoute } from '@tanstack/react-router'
import { UserRound } from 'lucide-react'

import { AccountSettings } from '@/settings/account'
import { settingsCopy } from '@/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/account')({
  staticData: {
    page: {
      title: settingsCopy.account.title,
      icon: UserRound,
      parent: '/settings',
      keywords: ['settings', 'account', 'profile', 'name', 'avatar'],
    },
  },
  component: AccountSettings,
})
