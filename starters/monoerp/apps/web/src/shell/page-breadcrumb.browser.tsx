import '@/styles.css'
import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Breadcrumb, BreadcrumbItem, BreadcrumbList } from '@/components/ui/breadcrumb'
import { appCopy } from '@/lib/app.copy'
import type { PageMeta } from '@/lib/modules/types'
import { PageBreadcrumb } from '@/shell/page-breadcrumb'

const fetchRecord = vi.fn(async () => ({ name: 'Unexpected request' }))

const recordQuery = (id: string) => queryOptions({ queryKey: ['record', id], queryFn: fetchRecord })

const detail: PageMeta = {
  title: 'Organization',
  recordTitle: (client, { id }) => client.getQueryData(recordQuery(id).queryKey)?.name,
}

function Crumb({
  client,
  id,
  page = detail,
}: {
  client: QueryClient
  id: string
  page?: PageMeta
}) {
  return (
    <QueryClientProvider client={client}>
      <Breadcrumb className="w-60">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <PageBreadcrumb page={page} params={{ id }} />
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('reads the loaded record and follows inline rename cache updates without fetching', async () => {
  const client = new QueryClient()
  client.setQueryData(recordQuery('one').queryKey, { name: 'Acme' })
  render(<Crumb client={client} id="one" />)
  expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Acme')
  expect(document.title).toBe(`Acme · ${appCopy.app.name}`)
  act(() => {
    client.setQueryData(recordQuery('one').queryKey, { name: 'Renamed Acme' })
  })
  expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('Renamed Acme')
  expect(document.title).toBe(`Renamed Acme · ${appCopy.app.name}`)
  expect(fetchRecord).not.toHaveBeenCalled()
})

it('shows a loading placeholder instead of the generic or previous record name', () => {
  const client = new QueryClient()
  const { rerender } = render(<Crumb client={client} id="one" />)
  expect(screen.queryByText('Organization')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: appCopy.data.loading })).toHaveAttribute(
    'aria-busy',
    'true',
  )
  act(() => {
    client.setQueryData(recordQuery('one').queryKey, { name: 'Acme' })
  })
  expect(screen.getByText('Acme')).toBeVisible()
  rerender(<Crumb client={client} id="two" />)
  expect(screen.queryByText('Acme')).not.toBeInTheDocument()
  expect(document.title).toBe(appCopy.app.name)
  act(() => {
    client.setQueryData(recordQuery('two').queryKey, { name: 'Next record' })
  })
  expect(screen.getByText('Next record')).toBeVisible()
  expect(fetchRecord).not.toHaveBeenCalled()
})

it('truncates long record names while exposing their full title', () => {
  const client = new QueryClient()
  const name = 'A very long organization name that must fit inside the sticky breadcrumb'
  client.setQueryData(recordQuery('one').queryKey, { name })
  render(<Crumb client={client} id="one" />)
  const label = screen.getByRole('link', { current: 'page' })
  expect(label).toHaveAttribute('title', name)
  expect(getComputedStyle(label).textOverflow).toBe('ellipsis')
  expect(label.scrollWidth).toBeGreaterThan(label.clientWidth)
})

it('keeps static pages readable and resets the browser title when leaving', () => {
  const client = new QueryClient()
  const { unmount } = render(<Crumb client={client} id="one" page={{ title: 'Organizations' }} />)
  expect(screen.getByText('Organizations')).toBeVisible()
  unmount()
  expect(document.title).toBe(appCopy.app.name)
})
