import type { ListFilterField } from '@/lib/filters'
import { selectFeatures } from '@/modules/features'
import type { RecordHistoryQuery } from '@/modules/types'
import type { ComponentType } from 'react'

export type OrganizationPanelProps = {
  portalAccountId: string | null
  onAddContact?: (person: { name?: string | null; email?: string | null }) => void
}

export type OrganizationPanelContribution = {
  id: string
  title: string
  component: ComponentType<OrganizationPanelProps>
  historyQuery?: (props: OrganizationPanelProps) => RecordHistoryQuery
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
      accountId: string | null | undefined
      accountIds: readonly (string | null | undefined)[]
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
}

export type DealSummaryContribution = {
  id: string
  title: string
  component: ComponentType<OrganizationPanelProps>
}

declare const __MODULE_FEATURE_PATHS__: Record<string, readonly string[]>

const features = import.meta.glob<{
  default: OrganizationPanelContribution
  organizationList?: OrganizationListContribution
  contactPanel?: ContactPanelContribution
  dealSummary?: DealSummaryContribution
}>('../../../../../connectors/*/frontend/crm/feature.tsx', { eager: true })

const selected = selectFeatures(
  __MODULE_FEATURE_PATHS__.crm ?? [],
  (path) => features[`../../../../../${path}/feature.tsx`],
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
