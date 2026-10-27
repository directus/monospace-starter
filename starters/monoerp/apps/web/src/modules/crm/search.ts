import { linkOptions } from '@tanstack/react-router'

import { monospace } from '@/lib/monospace'
import { contactSearchFilter, dealSearchFilter, organizationSearchFilter } from '@/modules/crm/data'
import type { ModuleSearch, SearchGroup, SearchHit } from '@/modules/types'
import { crmCopy } from '@/modules/crm/crm.copy'
import { organizationLogo, contactName, organizationName } from '@/modules/crm/entities'
import { ContactIcon, DealIcon, OrganizationIcon } from '@/modules/crm/icons'

const LIMIT = 5

async function searchOrganizations(q: string): Promise<SearchHit[]> {
  const rows = await monospace.organizations.readMany({
    fields: ['id', 'name', 'industry', 'domain'],
    filter: organizationSearchFilter(q),
    sort: [{ name: { direction: 'asc' } }],
    limit: LIMIT,
  })

  return rows.flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            title: organizationName(row),
            subtitle: row.industry ?? undefined,
            image: organizationLogo(row.domain),
            variant: 'square' as const,
            link: linkOptions({
              to: '/crm/organizations/$organizationId',
              params: { organizationId: row.id },
            }),
          },
        ]
      : [],
  )
}

async function searchContacts(q: string): Promise<SearchHit[]> {
  const rows = await monospace.contacts.readMany({
    fields: ['id', 'firstName', 'lastName', 'email'],
    filter: contactSearchFilter(q),
    sort: [{ lastName: { direction: 'asc' } }, { firstName: { direction: 'asc' } }],
    limit: LIMIT,
  })

  return rows.flatMap((row) =>
    row.id
      ? [
          {
            id: row.id,
            title: contactName(row),
            subtitle: row.email ?? undefined,
            variant: 'circle' as const,
            link: linkOptions({ to: '/crm/contacts/$contactId', params: { contactId: row.id } }),
          },
        ]
      : [],
  )
}

async function searchDeals(q: string): Promise<SearchHit[]> {
  const rows = await monospace.opportunities.readMany({
    fields: ['id', 'title'],
    include: { organizations: { fields: ['name'] } },
    filter: dealSearchFilter(q),
    sort: [{ updatedAt: { direction: 'desc' } }],
    limit: LIMIT,
  })

  return rows.flatMap((row) =>
    row.id && row.title
      ? [
          {
            id: row.id,
            title: row.title,
            subtitle: row.organizations?.name ?? undefined,
            link: linkOptions({ to: '/crm/deals/$dealId', params: { dealId: row.id } }),
          },
        ]
      : [],
  )
}

const searchers = [
  { scopeId: 'contacts', search: searchContacts },
  { scopeId: 'organizations', search: searchOrganizations },
  { scopeId: 'deals', search: searchDeals },
] as const

export const crmSearch: ModuleSearch = {
  scopes: [
    {
      id: 'contacts',
      label: crmCopy.contacts.title,
      icon: ContactIcon,
      list: (q) => linkOptions({ to: '/crm/contacts', search: { q } }),
    },
    {
      id: 'organizations',
      label: crmCopy.organizations.title,
      icon: OrganizationIcon,
      list: (q) => linkOptions({ to: '/crm/organizations', search: { q } }),
    },
    {
      id: 'deals',
      label: crmCopy.deals.title,
      icon: DealIcon,
      list: (q) => linkOptions({ to: '/crm/deals', search: { q } }),
    },
  ],
  async search(q, scopeId) {
    const groups = await Promise.all(
      searchers.flatMap(({ scopeId: id, search }) =>
        scopeId && id !== scopeId
          ? []
          : [search(q).then((hits): SearchGroup => ({ scopeId: id, hits }))],
      ),
    )

    return groups.filter((group) => group.hits.length > 0)
  },
}
