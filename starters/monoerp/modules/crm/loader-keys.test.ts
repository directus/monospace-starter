import { QueryClient } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { Route as ActivityRoute } from '@/modules/crm/routes/app/activity'
import { Route as ContactsRoute } from '@/modules/crm/routes/app/contacts'
import { Route as DealsRoute } from '@/modules/crm/routes/app/deals'
import { Route as OrganizationsRoute } from '@/modules/crm/routes/app/organizations'

import { contactsPagesQuery, dealsPagesQuery, dealsQuery, organizationsPagesQuery } from './data'

type Loader<TDeps> = (context: {
  context: { queryClient: QueryClient }
  deps: TDeps
}) => Promise<void>

// Runs a route's real loader and returns every query key it read, without fetching anything.
async function loadedKeys<TLoader, TDeps>(loader: TLoader, deps: TDeps) {
  const queryClient = new QueryClient()
  const keys: QueryKey[] = []

  const record = async ({ queryKey }: { queryKey: QueryKey }) => {
    keys.push(queryKey)
  }

  vi.spyOn(queryClient, 'query').mockImplementation(record)
  vi.spyOn(queryClient, 'infiniteQuery').mockImplementation(record)

  // SAFETY: the list loaders under test only read `context.queryClient` and `deps`.
  await (loader as Loader<TDeps>)({ context: { queryClient }, deps })

  return keys
}

const won = {
  rules: [{ id: 'status', type: 'rule' as const, path: ['status'], operator: 'is', value: 'won' }],
}

// Each page passes `Route.useLoaderDeps()` (or the deals `params` inside it) to the same factory,
// so the loader must read exactly that key, or the page fetches everything a second time.
describe('list loaders read what their pages read', () => {
  it('organizations', async () => {
    const deps = OrganizationsRoute.options.loaderDeps?.({ search: { q: 'acme' } })

    expect(deps).toBeDefined()
    expect(await loadedKeys(OrganizationsRoute.options.loader, deps)).toEqual([
      organizationsPagesQuery(deps ?? {}).queryKey,
    ])
  })

  it('contacts', async () => {
    const deps = ContactsRoute.options.loaderDeps?.({ search: { q: 'ada' } })

    expect(await loadedKeys(ContactsRoute.options.loader, deps)).toEqual([
      contactsPagesQuery(deps ?? {}).queryKey,
    ])
  })

  it('deals table and board use the same params, without the display switch', async () => {
    for (const display of ['table', 'board'] as const) {
      const deps = DealsRoute.options.loaderDeps?.({ search: { display, filters: won } })
      const params = deps?.params ?? {}
      const keys = await loadedKeys(DealsRoute.options.loader, deps)
      const list = display === 'board' ? dealsQuery(params) : dealsPagesQuery(params)

      expect(keys).toContainEqual(list.queryKey)
      expect(JSON.stringify(keys)).not.toContain('"display"')
    }
  })

  it('activity reads its list and counts', async () => {
    const deps = ActivityRoute.options.loaderDeps?.({ search: { view: 'todo', due: 'overdue' } })
    const keys = await loadedKeys(ActivityRoute.options.loader, deps)

    expect(keys.map((key) => key.slice(0, 2))).toEqual([
      ['activities', 'pages'],
      ['activities', 'open-due'],
    ])
  })
})
