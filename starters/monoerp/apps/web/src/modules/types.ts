import type { NavigateOptions } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

import type { FileRouteTypes } from '@/routeTree.gen'

export type RoutePath = FileRouteTypes['to']

// Each module adds its own key through declaration merging in its manifest.
export interface ModuleRegistry {}

export type ModuleId = keyof ModuleRegistry

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

export type PageMeta = {
  title: string
  icon?: LucideIcon
  module?: ModuleId
  /** Present means the page shows in the sidebar. Value sets the order. */
  nav?: number
  // Lets a page use the whole content width (boards, wide tables).
  fullWidth?: boolean
  // Pins the content box to the viewport height so the page's own scroller (board, virtualized
  // table) fills what's left instead of growing the page.
  fill?: boolean
  /** List page this page hangs under in breadcrumbs, for detail routes. */
  parent?: RoutePath
  /** Extra terms the command palette matches on. */
  keywords?: readonly string[]
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    page?: PageMeta
  }
}

export type SearchScope = {
  id: string
  label: string
  icon: LucideIcon
  // The scope's list page, filtered to the query. Built with `linkOptions` so the route checks it.
  list: (q: string) => NavigateOptions
}

export type SearchHit = {
  id: string
  title: string
  subtitle?: string
  image?: string
  visual?: 'contact' | 'organization'
  // Built with `linkOptions` so the route checks its params.
  link: NavigateOptions
}

export type SearchGroup = {
  scopeId: string
  hits: SearchHit[]
}

export type ModuleSearch = {
  scopes: SearchScope[]
  search: (q: string, scopeId?: string) => Promise<SearchGroup[]>
}

export type ModuleManifest = {
  id: ModuleId
  order: number
  label: string
  description: string
  icon: LucideIcon
  basePath: RoutePath
  search?: ModuleSearch
  settings?: {
    title: string
    pages: { title: string; to: RoutePath; icon: LucideIcon }[]
  }
}

export type RecordHistoryEntry = {
  id: string
  at: string
  render: (when: string, inset?: string) => React.ReactNode
}

export type RecordHistoryQuery = {
  queryKey: readonly unknown[]
  queryFn: (context: {
    client: import('@tanstack/react-query').QueryClient
  }) => Promise<RecordHistoryEntry[]>
  enabled: boolean
}

export type OrganizationListContribution = {
  filters: import('@/lib/filters').ListFilterField[]
  columns: {
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
