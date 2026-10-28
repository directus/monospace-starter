import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { isMissingFromWorkspace } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { checkrCandidateQuery, checkrPackagesQuery } from '@/modules/ats/data/interviews'
import type { CheckrCandidate } from '@/modules/ats/data/interviews'

const copy = atsCopy.interviews.checkr

const CHECKR_DASHBOARD = 'https://dashboard.checkr.com'

type CheckrStatus = keyof typeof copy.statuses

const TONES: Record<CheckrStatus, string> = {
  clear: 'bg-success/10 text-success',
  complete: 'bg-success/10 text-success',
  completed: 'bg-success/10 text-success',
  consider: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  suspended: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  dispute: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  pending: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  invited: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  canceled: 'bg-muted text-muted-foreground',
  expired: 'bg-destructive/10 text-destructive',
  none: 'bg-muted text-muted-foreground',
}

function isStatus(value: string | null | undefined): value is CheckrStatus {
  return Boolean(value) && Object.hasOwn(copy.statuses, value ?? '')
}

// A finished report shows its result (clear, consider); anything else its status.
function reportStatus(report: CheckrCandidate['reports'][number]) {
  return report.status === 'complete' ? (report.result ?? 'complete') : (report.status ?? 'pending')
}

// Where a candidate's check stands: the newest report, else the newest invitation.
export function checkrStatus(candidate: CheckrCandidate | null | undefined): CheckrStatus {
  const report = candidate?.reports[0]
  const invitation = candidate?.invitations[0]

  const status = report
    ? reportStatus(report)
    : invitation?.status === 'pending'
      ? 'invited'
      : invitation?.status === 'expired'
        ? 'expired'
        : invitation
          ? 'pending'
          : 'none'

  return isStatus(status) ? status : 'pending'
}

export function CheckrStatusChip({ status }: { status: string | null | undefined }) {
  const known = isStatus(status) ? status : 'none'

  return <Badge className={cn('border-transparent', TONES[known])}>{copy.statuses[known]}</Badge>
}

// A candidate's background check, read from Checkr by email. The connector is read-only, so
// checks are ordered in the Checkr dashboard.
export function BackgroundCheckPanel({ email }: { candidateId: Uuid; email: string | null }) {
  const checkr = useQuery({ ...checkrCandidateQuery(email ?? ''), enabled: Boolean(email) })
  const packages = useQuery({ ...checkrPackagesQuery(), enabled: Boolean(checkr.data) })

  const packageName = (slug: string | null | undefined) =>
    packages.data?.find((item) => item.slug === slug)?.name ?? slug ?? ''

  const candidate = checkr.data

  const link = candidate
    ? `${CHECKR_DASHBOARD}/candidates/${encodeURIComponent(candidate.id)}`
    : CHECKR_DASHBOARD

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <h2 className="font-semibold">{copy.title}</h2>
        {candidate ? <CheckrStatusChip status={checkrStatus(candidate)} /> : null}
        <span className="text-xs text-muted-foreground">
          {copy.source} · {copy.readOnly}
        </span>
        {email && !checkr.isError ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'ml-auto' })}
          >
            {candidate ? copy.openInCheckr : copy.start}
            <ExternalLink data-icon="inline-end" />
          </a>
        ) : null}
      </header>

      <div className="p-4">
        {!email ? (
          <p className="text-sm text-muted-foreground">{copy.noEmail}</p>
        ) : checkr.isPending ? (
          <DataLoading rows={2} />
        ) : isMissingFromWorkspace(checkr.error) ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{copy.notSetUp}</p>
            <p className="text-sm text-muted-foreground">{copy.addSource}</p>
          </div>
        ) : checkr.isError ? (
          <DataError error={checkr.error} />
        ) : !candidate ? (
          <div className="space-y-1">
            <p className="text-sm">{copy.none(email)}</p>
            <p className="text-sm text-muted-foreground">{copy.startHint}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <Group title={copy.reports}>
              {candidate.reports.length ? (
                candidate.reports.map((report) => (
                  <Row
                    key={report.id}
                    status={reportStatus(report)}
                    title={packageName(report.package)}
                    details={[
                      `${copy.created} ${formatDate(report.createdAt)}`,
                      report.completedAt
                        ? `${copy.completed} ${formatDate(report.completedAt)}`
                        : report.estimatedCompletionTime
                          ? `${copy.eta} ${formatDate(report.estimatedCompletionTime)}`
                          : null,
                      report.turnaroundTime
                        ? copy.turnaround(Math.round(report.turnaroundTime / 3600))
                        : null,
                      report.assessment ? `${copy.assessment}: ${report.assessment}` : null,
                    ]}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{copy.noReports}</p>
              )}
            </Group>
            {candidate.invitations.length ? (
              <Group title={copy.invitations}>
                {candidate.invitations.map((invitation) => (
                  <Row
                    key={invitation.id}
                    status={invitation.status === 'pending' ? 'invited' : invitation.status}
                    title={packageName(invitation.package)}
                    details={[
                      `${copy.sent} ${formatDate(invitation.createdAt)}`,
                      invitation.completedAt
                        ? `${copy.completed} ${formatDate(invitation.completedAt)}`
                        : invitation.expiresAt
                          ? `${invitation.status === 'expired' ? copy.expired : copy.expires} ${formatDate(invitation.expiresAt)}`
                          : null,
                    ]}
                  />
                ))}
              </Group>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {copy.candidateSince(formatDate(candidate.createdAt))}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function Row({
  status,
  title,
  details,
}: {
  status: string | null | undefined
  title: string
  details: Array<string | null>
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">{title}</span>
      <CheckrStatusChip status={status} />
      <span className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
        {details.filter(Boolean).join(' · ')}
      </span>
    </li>
  )
}
