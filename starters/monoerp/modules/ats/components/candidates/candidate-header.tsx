import { Link } from '@tanstack/react-router'
import {
  Briefcase,
  Building2,
  Code,
  Globe,
  Handshake,
  House,
  Mail,
  MapPin,
  Newspaper,
  Search,
  Tag,
  UserRoundSearch,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { InlineName } from '@/components/inline/inline-field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid, candidatesUpdateOneInput } from '@/generated/monospace'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import {
  CandidateAvatar,
  MultiJobBadge,
  RetentionBadge,
  TagList,
  locationLabel,
  splitTags,
} from '@/modules/ats/components/candidates/candidate-labels'
import type { CandidateDetail } from '@/modules/ats/data/candidates'
import { TalentPoolIcon } from '@/modules/ats/icons'

const copy = atsCopy.candidates

function SourceIcon({ source }: { source: string | null | undefined }) {
  switch (source) {
    case 'website':
      return <Globe />
    case 'linkedin':
      return <UserRoundSearch />
    case 'job_board':
      return <Newspaper />
    case 'referral':
      return <Handshake />
    case 'agency':
      return <Building2 />
    case 'internal':
      return <House />
    default:
      return <Search />
  }
}

// Name and actions on one row; contact facts under it; then how they came in and where they
// stand (source, talent pool, flags) as square chips, set apart from the round tag pills.
export function CandidateHeader({
  candidate,
  jobs,
  actions,
  onSaveName,
}: {
  candidate: CandidateDetail
  // Active applications: each job links to its pipeline.
  jobs: Array<{ id: Uuid; title: string; stage: string }>
  actions: ReactNode
  onSaveName: (data: candidatesUpdateOneInput) => Promise<void>
}) {
  const location = locationLabel(candidate)

  const links = [
    { url: candidate.linkedinUrl, icon: UserRoundSearch, label: copy.details.linkedin },
    { url: candidate.githubUrl, icon: Code, label: copy.details.github },
    { url: candidate.portfolioUrl, icon: Globe, label: copy.details.portfolio },
  ]

  return (
    <header className="flex items-start gap-3 md:gap-4 md:border-b md:pb-5">
      <CandidateAvatar
        candidate={candidate}
        size="lg"
        className="data-[size=lg]:size-12 md:data-[size=lg]:size-14 [&_[data-slot=avatar-fallback]]:text-base"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight md:text-2xl">
            <InlineName
              firstName={candidate.firstName}
              lastName={candidate.lastName}
              labels={{
                first: copy.form.firstName,
                last: copy.form.lastName,
                name: copy.details.name,
              }}
              displayClassName="text-xl font-semibold tracking-tight md:text-2xl"
              inputClassName="h-8 py-0 text-lg font-semibold"
              onSave={onSaveName}
            />
          </h1>
          <div className="flex items-center gap-2 max-sm:order-last max-sm:w-full">{actions}</div>
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <a
            href={`mailto:${candidate.email}`}
            className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
          >
            <Mail className="size-3.5" />
            {candidate.email}
          </a>
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {location}
            </span>
          ) : null}
          {jobs.map((job) => (
            <Link
              key={job.id}
              to="/ats/jobs/$jobId"
              params={{ jobId: job.id }}
              className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground hover:underline"
            >
              <Briefcase className="size-3.5 shrink-0" />
              <span className="truncate">
                <span className="text-foreground">{job.title}</span> · {job.stage}
              </span>
            </Link>
          ))}
          {links.map(({ url, icon: Icon, label }) =>
            url ? (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
              >
                <Icon className="size-3.5" />
                {label}
              </a>
            ) : null,
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            icon={<SourceIcon source={candidate.source} />}
            tooltip={copy.details.source}
            className="bg-muted text-foreground/80"
          >
            {optionLabel('source', candidate.source)}
            {candidate.sourceDetail ? (
              <span className="text-muted-foreground">· {candidate.sourceDetail}</span>
            ) : null}
          </Chip>
          {candidate.inTalentPool ? (
            <Chip
              icon={<TalentPoolIcon />}
              className="bg-sky-500/10 text-sky-700 dark:text-sky-300"
            >
              {copy.inPool}
            </Chip>
          ) : null}
          <MultiJobBadge count={jobs.length} chip />
          <RetentionBadge retainUntil={candidate.retainUntil} chip />
          {splitTags(candidate.tags).length ? (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              <Tag className="size-3.5 text-muted-foreground" aria-label={copy.details.tags} />
              <TagList tags={candidate.tags} className="[&>span]:h-6 [&>span]:px-2.5" />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function Chip({
  icon,
  tooltip,
  className,
  children,
}: {
  icon: ReactNode
  tooltip?: string
  className?: string
  children: ReactNode
}) {
  const chip = (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs leading-none font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )

  if (!tooltip) return chip

  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
