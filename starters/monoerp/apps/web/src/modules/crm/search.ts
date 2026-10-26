import { linkOptions } from '@tanstack/react-router'

import { monospace } from '@/lib/monospace'
import {
  contactSearchFilter,
  opportunitySearchFilter,
  organizationSearchFilter,
} from '@/modules/crm/data'
import type { ModuleSearch, SearchGroup, SearchHit } from '@/modules/types'
import { crmCopy } from '@/modules/crm/crm.copy'
import { organizationLogo } from '@/modules/crm/entity-options'
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
            title: row.name ?? crmCopy.organizations.restricted,
            subtitle: row.industry ?? undefined,
            image: organizationLogo(row.domain),
            visual: 'organization' as const,
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
            title:
              [row.firstName, row.lastName].filter(Boolean).join(' ') ||
              `${crmCopy.contacts.restrictedName.first} ${crmCopy.contacts.restrictedName.last}`,
            subtitle: row.email ?? undefined,
            visual: 'contact' as const,
            link: linkOptions({ to: '/crm/contacts/$contactId', params: { contactId: row.id } }),
          },
        ]
      : [],
  )
}

async function searchOpportunities(q: string): Promise<SearchHit[]> {
  const rows = await monospace.opportunities.readMany({
    fields: ['id', 'title'],
    include: { organizations: { fields: ['name'] } },
    filter: opportunitySearchFilter(q),
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
  { scopeId: 'opportunities', search: searchOpportunities },
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
      id: 'opportunities',
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
