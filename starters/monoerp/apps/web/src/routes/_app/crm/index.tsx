import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { DashboardCharts } from '@/modules/crm/components/dashboard-charts'
import { crmCopy } from '@/modules/crm/crm.copy'
import { dealsQuery } from '@/modules/crm/data'

const homeDealsQuery = dealsQuery({})

export const Route = createFileRoute('/_app/crm/')({
  staticData: {
    page: { title: crmCopy.dashboard.navTitle, icon: LayoutDashboard, module: 'crm', nav: 10 },
  },
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...homeDealsQuery, staleTime: 'static' })
  },
  component: HomePage,
})

function HomePage() {
  const deals = useSuspenseQuery(homeDealsQuery)

  return (
    <div className="space-y-6">
      <PageHeader title={crmCopy.dashboard.title} description={crmCopy.dashboard.description} />
      <DashboardCharts deals={deals.data} />
    </div>
  )
}
