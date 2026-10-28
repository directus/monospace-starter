import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, MapPin } from 'lucide-react'
import { useState } from 'react'

import { DataLoading } from '@/components/data-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { uuidParam } from '@/lib/uuid'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { ApplyForm } from '@/modules/ats/components/careers/apply-form'
import { JobDescription } from '@/modules/ats/components/careers/job-description'
import {
  careerErrorMessage,
  careerJobQuery,
  jobLocations,
  type CareerJob,
} from '@/modules/ats/data/careers'

const copy = atsCopy.careers

export const Route = createFileRoute('/careers/$jobId')({
  params: { parse: ({ jobId }) => ({ jobId: uuidParam(jobId) }) },
  // A failed read shows on the page (with a way back), not as the app's error screen.
  loader: async ({ context: { queryClient }, params }) => {
    const job = await queryClient
      .query({ ...careerJobQuery(params.jobId), staleTime: 'static' })
      .catch(() => null)

    return { title: job?.title ?? null }
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.title ? [{ title: copy.jobPageTitle(loaderData.title) }] : [],
  }),
  component: JobPage,
  // A malformed id in the URL reads as a role that's gone, inside the careers frame.
  notFoundComponent: () => (
    <Notice
      title={copy.job.closedTitle}
      description={copy.job.closedDescription}
      action={copy.job.closedAction}
    />
  ),
})

function JobPage() {
  const { jobId } = Route.useParams()
  const job = useQuery(careerJobQuery(jobId))
  const [submitted, setSubmitted] = useState<string>()

  if (job.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <DataLoading rows={8} />
      </div>
    )
  }

  if (job.isError) {
    return (
      <Notice
        title={careerErrorMessage(job.error, copy.job.loadFailed)}
        description=""
        action={copy.job.back}
      />
    )
  }

  if (!job.data) {
    return (
      <Notice
        title={copy.job.closedTitle}
        description={copy.job.closedDescription}
        action={copy.job.closedAction}
      />
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-5 pt-10 pb-20 sm:px-8 sm:pt-14">
      <Link
        to="/careers"
        hash="roles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {copy.job.back}
      </Link>
      <JobHeader job={job.data} applied={Boolean(submitted)} />
      {submitted !== undefined ? (
        <Success name={submitted} job={job.data.title ?? ''} />
      ) : (
        <>
          <section className="mt-10 border-t pt-10">
            <h2 className="sr-only">{copy.job.about}</h2>
            <JobDescription text={job.data.description} fallback={copy.job.noDescription} />
          </section>
          <section
            id="apply"
            aria-labelledby="apply-title"
            className="mt-14 scroll-mt-20 rounded-2xl border bg-card p-5 shadow-xs sm:p-8"
          >
            <h2 id="apply-title" className="text-2xl font-semibold tracking-tight">
              {copy.form.title}
            </h2>
            <p className="mt-1.5 mb-8 text-sm text-muted-foreground">{copy.form.description}</p>
            <ApplyForm
              job={job.data}
              onSubmitted={(name) => {
                setSubmitted(name)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          </section>
        </>
      )}
    </article>
  )
}

function JobHeader({ job, applied }: { job: CareerJob; applied: boolean }) {
  return (
    <header className="mt-8">
      {job.departments?.name ? (
        <p className="text-sm font-semibold text-(--brand)">{job.departments.name}</p>
      ) : null}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        {job.title}
      </h1>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {jobLocations(job).map((location) => (
          <Badge key={location} variant="secondary" className="h-6 px-2.5 font-normal">
            <MapPin data-icon="inline-start" />
            {location}
          </Badge>
        ))}
        <Badge variant="secondary" className="h-6 px-2.5 font-normal">
          <Clock data-icon="inline-start" />
          {optionLabel('employmentType', job.employmentType)}
        </Badge>
      </div>
      {applied ? null : (
        <Button
          size="lg"
          nativeButton={false}
          className="mt-8 h-11 bg-(--brand) px-5 text-white hover:bg-(--brand)/90"
          render={<a href="#apply" />}
        >
          {copy.job.apply}
          <ArrowRight data-icon="inline-end" />
        </Button>
      )}
    </header>
  )
}

function Success({ name, job }: { name: string; job: string }) {
  return (
    <section role="status" className="mt-10 rounded-2xl border bg-card p-6 shadow-xs sm:p-10">
      <span className="grid size-11 place-items-center rounded-full bg-(--brand-soft) text-(--brand)">
        <CheckCircle2 className="size-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">{copy.success.title(name)}</h2>
      <p className="mt-2 max-w-xl leading-7 text-muted-foreground">
        {copy.success.description(job)}
      </p>
      <h3 className="mt-8 text-sm font-semibold">{copy.success.nextTitle}</h3>
      <ol className="mt-3 space-y-3">
        {copy.success.next.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm leading-6">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        className="mt-8"
        nativeButton={false}
        render={<Link to="/careers" hash="roles" />}
      >
        {copy.success.more}
      </Button>
    </section>
  )
}

function Notice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: string
}) {
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
      <Button
        className="mt-8 bg-(--brand) text-white hover:bg-(--brand)/90"
        nativeButton={false}
        render={<Link to="/careers" hash="roles" />}
      >
        {action}
      </Button>
    </div>
  )
}
