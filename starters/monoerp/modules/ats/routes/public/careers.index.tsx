import { noop, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Clock, MapPin, Search } from 'lucide-react'
import { useMemo } from 'react'
import { z } from 'zod'

import { DataLoading } from '@/components/data-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import {
  careerErrorMessage,
  careerJobsQuery,
  jobLocations,
  type CareerJob,
} from '@/modules/ats/data/careers'

const copy = atsCopy.careers

const ALL = 'all'

export const Route = createFileRoute('/careers/')({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    department: z.string().optional().catch(undefined),
    location: z.string().optional().catch(undefined),
  }),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...careerJobsQuery(), staleTime: 'static' }).catch(noop)
  },
  component: CareersPage,
})

function CareersPage() {
  return (
    <>
      <Hero />
      <Roles />
    </>
  )
}

function Hero() {
  return (
    <section className="border-b bg-[radial-gradient(60rem_24rem_at_15%_-10%,var(--brand-soft),transparent)]">
      <div className="mx-auto max-w-5xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
        <p className="text-sm font-semibold tracking-wide text-(--brand) uppercase">
          {copy.hero.eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {copy.hero.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
          {copy.hero.description}
        </p>
        <Button
          size="lg"
          nativeButton={false}
          className="mt-8 h-11 bg-(--brand) px-5 text-white hover:bg-(--brand)/90"
          render={<Link to="/careers" hash="roles" />}
        >
          {copy.hero.cta}
          <ArrowRight data-icon="inline-end" />
        </Button>
        <dl className="mt-14 grid gap-8 sm:grid-cols-3">
          {copy.values.map((value) => (
            <div key={value.title} className="border-t pt-4">
              <dt className="font-medium">{value.title}</dt>
              <dd className="mt-1 text-sm leading-6 text-muted-foreground">{value.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Roles() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const jobs = useQuery(careerJobsQuery())
  const q = search.q?.trim().toLowerCase() ?? ''

  const { departments, locations } = useMemo(() => {
    const rows = jobs.data ?? []

    return {
      departments: [...new Set(rows.flatMap((job) => job.departments?.name ?? []))].sort(),
      locations: [...new Set(rows.flatMap(jobLocations))].sort(),
    }
  }, [jobs.data])

  const shown = (jobs.data ?? []).filter(
    (job) =>
      (!search.department || job.departments?.name === search.department) &&
      (!search.location || jobLocations(job).includes(search.location)) &&
      (!q || [job.title, job.departments?.name].some((value) => value?.toLowerCase().includes(q))),
  )

  const groups = new Map<string, Array<CareerJob>>()

  for (const job of shown) {
    const name = job.departments?.name ?? ''

    groups.set(name, [...(groups.get(name) ?? []), job])
  }

  const filtered = Boolean(search.q || search.department || search.location)

  const setFilter = (key: 'department' | 'location', value: string | null) =>
    void navigate({
      search: (previous) => ({ ...previous, [key]: value && value !== ALL ? value : undefined }),
      replace: true,
    })

  return (
    <section id="roles" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.list.title}</h2>
        {jobs.isSuccess ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {copy.list.count(shown.length)}
          </p>
        ) : null}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={copy.list.search}
            placeholder={copy.list.search}
            value={search.q ?? ''}
            className="h-10 pl-9"
            onChange={(event) =>
              void navigate({
                search: (previous) => ({ ...previous, q: event.target.value || undefined }),
                replace: true,
              })
            }
          />
        </div>
        <Filter
          label={copy.list.department}
          allLabel={copy.list.allDepartments}
          value={search.department}
          options={departments}
          onChange={(value) => setFilter('department', value)}
        />
        <Filter
          label={copy.list.location}
          allLabel={copy.list.allLocations}
          value={search.location}
          options={locations}
          onChange={(value) => setFilter('location', value)}
        />
      </div>

      <div className="mt-10">
        {jobs.isPending ? (
          <DataLoading rows={6} />
        ) : jobs.isError ? (
          <p
            role="alert"
            className="rounded-xl border px-5 py-10 text-center text-muted-foreground"
          >
            {careerErrorMessage(jobs.error, copy.list.loadFailed)}
          </p>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed px-5 py-14 text-center">
            <p className="text-muted-foreground">
              {filtered ? copy.list.emptyFiltered : copy.list.empty}
            </p>
            {filtered ? (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void navigate({ search: {}, replace: true })}
              >
                {copy.list.clear}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-12">
            {[...groups].map(([department, rows]) => (
              <section key={department} aria-labelledby={`department-${department}`}>
                <div className="flex items-baseline gap-3 border-b pb-3">
                  <h3 id={`department-${department}`} className="text-lg font-semibold">
                    {department}
                  </h3>
                  <span className="text-sm text-muted-foreground">
                    {copy.list.roles(rows.length)}
                  </span>
                </div>
                <ul className="divide-y">
                  {rows.map((job) => (
                    <JobRow key={job.id} job={job} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Filter({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string
  allLabel: string
  value: string | undefined
  options: Array<string>
  onChange: (value: string | null) => void
}) {
  const items = [
    { value: ALL, label: allLabel },
    ...options.map((option) => ({ value: option, label: option })),
  ]

  return (
    <Select items={items} value={value ?? ALL} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full data-[size=default]:h-10">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function JobRow({ job }: { job: CareerJob }) {
  return (
    <li>
      <Link
        to="/careers/$jobId"
        params={{ jobId: job.id }}
        className="group -mx-3 flex items-center gap-4 rounded-lg px-3 py-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-(--brand)"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium group-hover:text-(--brand)">{job.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {job.locations ? (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {jobLocations(job).join(' · ')}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {optionLabel('employmentType', job.employmentType)}
            </span>
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-(--brand)" />
      </Link>
    </li>
  )
}
