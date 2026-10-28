import { useQuery } from '@tanstack/react-query'

import { InlineRelation, Property, PropertyList } from '@/components/inline/inline-field'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { UserLabel, userFromOption } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { usersById } from '@/lib/monospace-system'
import { useCollectionAccess } from '@/lib/permissions'
import { ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'
import type { JobDetail, PipelineApplication } from '@/modules/ats/data/jobs'
import { useUpdateJob } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs.team

export function HiringTeam({
  job,
  applications,
}: {
  job: JobDetail
  applications: Array<PipelineApplication>
}) {
  const access = useCollectionAccess('requisitions')
  const update = useUpdateJob()

  // Interviewer -> how many of this job's candidates they've interviewed.
  const counts = new Map<Uuid, number>()

  for (const application of applications) {
    for (const id of new Set(application.interviewerIds)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  const ids = [...counts.keys()].sort()

  const users = useQuery({
    queryKey: ['requisitions', 'interviewers', ids],
    queryFn: () => usersById(ids),
    enabled: ids.length > 0,
  })

  const interviewers = ids
    .map((id) => ({ id, user: users.data?.get(id) ?? null, count: counts.get(id) ?? 0 }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Frame dense>
        <FrameHeader className="px-5 py-3">
          <FrameTitle>{copy.title}</FrameTitle>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </FrameHeader>
        <FramePanel className="px-5 py-4">
          <PropertyList>
            <Property
              label={copy.hiringManager}
              readOnly={!access.canUpdate('hiringManagerUserId')}
            >
              <InlineRelation
                label={copy.hiringManager}
                value={ownerOption(job.hiringManagerUser)}
                search={lookupUsers}
                render={(option) => <UserLabel user={userFromOption(option)} size="sm" />}
                onSave={async (option) => {
                  await update.mutateAsync({
                    id: job.id,
                    data: { hiringManagerUserId: option?.value ?? null },
                  })
                }}
              />
            </Property>
            <Property label={copy.recruiter} readOnly={!access.canUpdate('recruiterUserId')}>
              <InlineRelation
                label={copy.recruiter}
                value={ownerOption(job.recruiterUser)}
                search={lookupUsers}
                render={(option) => <UserLabel user={userFromOption(option)} size="sm" />}
                onSave={async (option) => {
                  await update.mutateAsync({
                    id: job.id,
                    data: { recruiterUserId: option?.value ?? null },
                  })
                }}
              />
            </Property>
          </PropertyList>
        </FramePanel>
      </Frame>
      <Frame stacked dense>
        <FrameHeader className="px-5 py-3">
          <FrameTitle>
            {copy.interviewers}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground tabular-nums">
              {interviewers.length}
            </span>
          </FrameTitle>
          <p className="text-xs text-muted-foreground">{copy.interviewersDescription}</p>
        </FrameHeader>
        {interviewers.length ? (
          interviewers.map((row) => (
            <FramePanel
              key={row.id}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <UserLabel user={row.user} size="sm" />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {copy.interviews(row.count)}
              </span>
            </FramePanel>
          ))
        ) : (
          <FramePanel className="px-5 py-4">
            <p className="text-sm text-muted-foreground">{copy.noInterviewers}</p>
          </FramePanel>
        )}
      </Frame>
    </div>
  )
}
