import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { atsCopy } from '@/modules/ats/ats.copy'
import { careerErrorMessage, careerJobQuery, careerJobsQuery } from '@/modules/ats/data/careers'
import { worker } from '@/test/msw'

const copy = atsCopy.careers

const id = '00000000-0000-4000-8106-000000000900'

afterEach(cleanup)

function CareersRead({ detail }: { detail: boolean }) {
  const jobs = useQuery(careerJobsQuery())
  const job = useQuery({ ...careerJobQuery(id), enabled: detail })
  const error = detail ? job.error : jobs.error

  return error ? <p role="alert">{careerErrorMessage(error, copy.list.loadFailed)}</p> : null
}

describe('public careers without a policy', () => {
  it.each([false, true])('explains denied access (job detail: %s)', async (detail) => {
    worker.use(
      http.get('/api/monoerp/items/requisitions', () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    )

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CareersRead detail={detail} />
      </QueryClientProvider>,
    )

    await expect.element(page.getByRole('alert')).toHaveTextContent(copy.notEnabled)
  })

  it('keeps server failures distinct from disabled public access', async () => {
    worker.use(
      http.get('/api/monoerp/items/requisitions', () =>
        HttpResponse.json({ message: 'Unavailable' }, { status: 500 }),
      ),
    )

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CareersRead detail={false} />
      </QueryClientProvider>,
    )

    await expect.element(page.getByRole('alert')).toHaveTextContent(copy.list.loadFailed)
  })
})
