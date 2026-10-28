import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType } from 'react'

import type { organizationsUpdateOneInput } from '@/generated/monospace'
import type { ListFilterField } from '@/lib/filters'
import { selectFeatures } from '@/lib/modules/features'
import type { RecordHistoryQuery } from '@/lib/modules/types'
import type { OrganizationRow } from '@/modules/crm/data'

type Organization = { [Field in keyof OrganizationRow]?: OrganizationRow[Field] | null }

type Prefetch<Props> = (queryClient: QueryClient, props: Props) => void

export type OrganizationPanelProps = {
  organization: Organization | null | undefined
  onAddContact?: (person: { name?: string | null; email?: string | null }) => void
}

export type OrganizationPanelContribution = {
  id: string
  title: string
  component: ComponentType<OrganizationPanelProps>
  historyQuery?: (props: OrganizationPanelProps) => RecordHistoryQuery
  prefetch?: Prefetch<OrganizationPanelProps>
  detailField?: ComponentType<{
    organization: Organization
    canUpdate: (field: string) => boolean
    onSave: (values: organizationsUpdateOneInput) => Promise<void>
  }>
}

export type OrganizationListContribution = {
  filters: ListFilterField[]
  columns: {
    before: string
    id: string
    header: string
    size: number
    meta?: { headerClassName: string; cellClassName: string }
    component: ComponentType<{
      organization: Organization
      organizations: readonly Organization[]
    }>
  }[]
}

export type ContactPanelProps = { email: string | null | undefined }

export type ContactPanelContribution = {
  id: string
  title: string
  summaryTitle: string
  component: ComponentType<ContactPanelProps>
  summary: ComponentType<ContactPanelProps>
  historyQuery: (props: ContactPanelProps) => RecordHistoryQuery
  prefetch?: Prefetch<ContactPanelProps>
}

export type DealSummaryContribution = {
  id: string
  title: string
  component: ComponentType<OrganizationPanelProps>
  prefetch?: Prefetch<OrganizationPanelProps>
}

declare const __MODULE_FEATURE_PATHS__: Record<string, readonly string[]>

const features = import.meta.glob<{
  default: OrganizationPanelContribution
  organizationList?: OrganizationListContribution
  contactPanel?: ContactPanelContribution
  dealSummary?: DealSummaryContribution
}>('../../connectors/*/frontend/crm/feature.tsx', { eager: true })

const selected = selectFeatures(
  __MODULE_FEATURE_PATHS__.crm ?? [],
  (path) => features[`../../${path}/feature.tsx`],
)

export const organizationPanels = selected.map((feature) => feature.default)

export const organizationLists = selected.flatMap((feature) =>
  feature.organizationList ? [feature.organizationList] : [],
)

export const contactPanels = selected.flatMap((feature) =>
  feature.contactPanel ? [feature.contactPanel] : [],
)

export const dealSummaries = selected.flatMap((feature) =>
  feature.dealSummary ? [feature.dealSummary] : [],
)
