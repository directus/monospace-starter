import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { DashboardCharts } from '@/modules/crm/components/dashboard-charts'
import { crmCopy } from '@/modules/crm/crm.copy'
import { dealsQuery } from '@/modules/crm/data'

const homeDealsQuery = dealsQuery({})

export const Route = createFileRoute('/_app/crm/')({
  staticData: {
    page: { title: crmCopy.dashboard.navTitle, icon: LayoutDashboard, module: 'crm', nav: 10 },
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(homeDealsQuery),
  component: HomePage,
})

function HomePage() {
  const deals = useQuery(homeDealsQuery)

  if (deals.isPending) {
    return <DataLoading rows={8} />
  }

  if (deals.isError) {
    return <DataError error={deals.error} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title={crmCopy.dashboard.title} description={crmCopy.dashboard.description} />
      <DashboardCharts deals={deals.data} />
    </div>
  )
}
