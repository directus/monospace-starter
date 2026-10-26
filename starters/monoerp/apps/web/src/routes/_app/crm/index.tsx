import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { DashboardCharts } from '@/modules/crm/components/dashboard-charts'
import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { opportunitiesQuery } from '@/modules/crm/data'
import { crmCopy } from '@/modules/crm/crm.copy'

const homeOpportunitiesQuery = opportunitiesQuery({})

export const Route = createFileRoute('/_app/crm/')({
  staticData: {
    page: { title: crmCopy.dashboard.navTitle, icon: LayoutDashboard, module: 'crm', nav: 10 },
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(homeOpportunitiesQuery),
  component: HomePage,
})

function HomePage() {
  const opportunities = useQuery(homeOpportunitiesQuery)

  if (opportunities.isPending) {
    return <DataLoading rows={8} />
  }

  if (opportunities.isError) {
    return <DataError error={opportunities.error} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title={crmCopy.dashboard.title} description={crmCopy.dashboard.description} />
      <DashboardCharts opportunities={opportunities.data} />
    </div>
  )
}
