import { createFileRoute } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'

import { HiringLocationsSettings } from '@/modules/ats/settings/ats-locations'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

export const Route = createFileRoute('/_app/settings/ats/locations')({
  staticData: {
    page: {
      title: atsSettingsCopy.hiringLocations.title,
      icon: MapPin,
      parent: '/settings',
      keywords: atsSettingsCopy.hiringLocations.keywords,
    },
  },
  component: HiringLocationsSettings,
})
