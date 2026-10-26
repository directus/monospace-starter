import type {
  OrganizationPanelContribution,
  OrganizationListContribution,
  ContactPanelContribution,
  DealSummaryContribution,
} from '@/modules/types'

declare const __CRM_ORGANIZATION_PANEL_PATHS__: readonly string[]

const features = import.meta.glob<{
  default: OrganizationPanelContribution
  organizationList?: OrganizationListContribution
  contactPanel?: ContactPanelContribution
  dealSummary?: DealSummaryContribution
}>('../../../../connectors/*/frontend/crm/feature.tsx', { eager: true })

const selected = __CRM_ORGANIZATION_PANEL_PATHS__.map((path) => {
  const feature = features[`../../../../${path}/feature.tsx`]

  if (!feature) throw new Error(`Selected organization panel entry is missing: ${path}/feature.tsx`)

  return feature
})

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
