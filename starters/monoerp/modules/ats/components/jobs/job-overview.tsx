import { Link } from '@tanstack/react-router'
import { ArrowUpRight, LockKeyhole } from 'lucide-react'
import { z } from 'zod'

import {
  InlineRelation,
  InlineSelect,
  InlineText,
  Property,
  PropertyList,
} from '@/components/inline/inline-field'
import { NotesEditor } from '@/components/notes-editor'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { UserLabel } from '@/components/users'
import type { requisitionsUpdateOneInput } from '@/generated/monospace'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { atsCopy } from '@/modules/ats/ats.copy'
import { InlineLocations, InlineLongText } from '@/modules/ats/components/jobs/inline-extras'
import type { JobDetail } from '@/modules/ats/data/jobs'
import { lookupDepartments, lookupJobLevels } from '@/modules/ats/data/shared'
import { useUpdateJob } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs.overview

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

const yesNo = [
  { value: 'yes', label: copy.yes },
  { value: 'no', label: copy.no },
]

const openingsSchema = z
  .string()
  .regex(/^\d+$/, 'Enter a whole number')
  .refine((value) => Number(value) >= 1 && Number(value) <= 50, 'Between 1 and 50')

const teamSizeSchema = z.union([z.literal(''), z.string().regex(/^\d+$/, 'Enter a whole number')])

export function JobOverview({ job }: { job: JobDetail }) {
  const access = useCollectionAccess('requisitions')
  const update = useUpdateJob()
  const updateQuietly = useUpdateJob({ notify: false })

  const save = async (data: requisitionsUpdateOneInput) => {
    await update.mutateAsync({ id: job.id, data })
  }

  const ro = (field: string) => !access.canUpdate(field)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="space-y-6">
        <Frame dense>
          <FrameHeader className="px-5 py-3">
            <FrameTitle>{copy.requisition}</FrameTitle>
          </FrameHeader>
          <FramePanel className="px-5 py-4">
            <PropertyList className="grid space-y-0 gap-x-6 gap-y-4 sm:grid-cols-2">
              <Property label={copy.department} readOnly={ro('departmentId')}>
                <InlineRelation
                  label={copy.department}
                  value={
                    job.departments?.id
                      ? { value: job.departments.id, label: job.departments.name ?? '' }
                      : null
                  }
                  search={lookupDepartments}
                  clearable={false}
                  onSave={async (option) => {
                    if (option) await save({ departmentId: option.value })
                  }}
                />
              </Property>
              <Property label={copy.level} readOnly={ro('jobLevelId')}>
                <InlineRelation
                  label={copy.level}
                  value={
                    job.job_levels?.id
                      ? { value: job.job_levels.id, label: job.job_levels.name ?? '' }
                      : null
                  }
                  search={lookupJobLevels}
                  onSave={(option) => save({ jobLevelId: option?.value ?? null })}
                />
              </Property>
              <Property label={copy.employmentType} readOnly={ro('employmentType')}>
                <InlineSelect
                  label={copy.employmentType}
                  value={job.employmentType}
                  options={options(atsCopy.options.employmentType)}
                  onSave={(value) => save({ employmentType: value })}
                />
              </Property>
              <Property label={copy.openings} readOnly={ro('numberOfHires')}>
                <InlineText
                  label={copy.openings}
                  type="number"
                  value={job.numberOfHires != null ? String(job.numberOfHires) : null}
                  validate={openingsSchema}
                  onSave={async (value) => {
                    if (value) await save({ numberOfHires: Number(value) })
                  }}
                />
              </Property>
              <Property label={copy.urgency} readOnly={ro('urgency')}>
                <InlineSelect
                  label={copy.urgency}
                  value={job.urgency}
                  options={options(atsCopy.options.urgency)}
                  onSave={(value) => save({ urgency: value })}
                />
              </Property>
              <Property label={copy.hiringReason} readOnly={ro('hiringReason')}>
                <InlineSelect
                  label={copy.hiringReason}
                  value={job.hiringReason}
                  options={options(atsCopy.options.hiringReason)}
                  onSave={(value) => save({ hiringReason: value })}
                />
              </Property>
              <div className="sm:col-span-2">
                <Property label={copy.locations} readOnly={ro('locations')}>
                  <InlineLocations
                    label={copy.locations}
                    value={job.locations}
                    onSave={(value) => save({ locations: value })}
                  />
                </Property>
              </div>
              <Property label={copy.confidential} readOnly={ro('isConfidential')}>
                <InlineSelect
                  label={copy.confidential}
                  value={job.isConfidential ? 'yes' : 'no'}
                  options={yesNo}
                  onSave={(value) => save({ isConfidential: value === 'yes' })}
                />
              </Property>
              <Property label={copy.postExternally} readOnly={ro('postExternally')}>
                <InlineSelect
                  label={copy.postExternally}
                  value={job.postExternally ? 'yes' : 'no'}
                  options={yesNo}
                  onSave={(value) => save({ postExternally: value === 'yes' })}
                />
              </Property>
            </PropertyList>
          </FramePanel>
        </Frame>

        <BudgetCard job={job} />

        <Frame dense>
          <FrameHeader className="px-5 py-3">
            <FrameTitle>{copy.audit}</FrameTitle>
          </FrameHeader>
          <FramePanel className="px-5 py-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <AuditItem label={copy.created} at={job.createdAt} user={job.createdBy} />
              <AuditItem label={copy.lastModified} at={job.updatedAt} user={job.updatedBy} />
              {job.openedAt ? <AuditItem label={copy.opened} at={job.openedAt} /> : null}
              {job.closedAt ? <AuditItem label={copy.closed} at={job.closedAt} /> : null}
            </dl>
          </FramePanel>
        </Frame>
      </div>

      <div className="space-y-6">
        <Frame dense>
          <FrameHeader className="px-5 py-3">
            <FrameTitle>{copy.kickoff}</FrameTitle>
            <p className="text-xs text-muted-foreground">
              {job.kickoffAt
                ? `${copy.kickoffAt} ${formatDate(job.kickoffAt)}`
                : copy.kickoffDescription}
            </p>
          </FrameHeader>
          <FramePanel className="px-5 py-4">
            <PropertyList>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Property label={copy.leadership} readOnly={ro('isLeadership')}>
                  <InlineSelect
                    label={copy.leadership}
                    value={job.isLeadership ? 'yes' : 'no'}
                    options={yesNo}
                    onSave={(value) => save({ isLeadership: value === 'yes' })}
                  />
                </Property>
                <Property label={copy.teamSize} readOnly={ro('teamSize')}>
                  <InlineText
                    label={copy.teamSize}
                    type="number"
                    value={job.teamSize != null ? String(job.teamSize) : null}
                    validate={teamSizeSchema}
                    onSave={(value) => save({ teamSize: value ? Number(value) : null })}
                  />
                </Property>
              </div>
              <Property label={copy.mustHave} readOnly={ro('mustHaveSkills')}>
                <InlineLongText
                  label={copy.mustHave}
                  value={job.mustHaveSkills}
                  onSave={(value) => save({ mustHaveSkills: value })}
                />
              </Property>
              <Property label={copy.niceToHave} readOnly={ro('niceToHaveSkills')}>
                <InlineLongText
                  label={copy.niceToHave}
                  value={job.niceToHaveSkills}
                  onSave={(value) => save({ niceToHaveSkills: value })}
                />
              </Property>
              <Property label={copy.kickoffNotes} readOnly={ro('kickoffNotes')}>
                <InlineLongText
                  label={copy.kickoffNotes}
                  value={job.kickoffNotes}
                  onSave={(value) => save({ kickoffNotes: value })}
                />
              </Property>
            </PropertyList>
          </FramePanel>
        </Frame>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{copy.description}</h2>
          <NotesEditor
            key={job.id}
            value={job.description}
            onSave={async (description) => {
              await updateQuietly.mutateAsync({ id: job.id, data: { description } })
            }}
          />
        </section>
      </div>
    </div>
  )
}

function range(min: string | null | undefined, max: string | null | undefined, currency: string) {
  if (!min && !max) return null

  if (!min || !max || min === max) return formatMoney(min ?? max, currency)

  return copy.range(formatMoney(min, currency), formatMoney(max, currency))
}

function BudgetCard({ job }: { job: JobDetail }) {
  const request = job.role_requests
  const currency = request?.approvedCurrency ?? job.currency ?? 'USD'
  const base = range(request?.approvedBaseMin, request?.approvedBaseMax, currency)
  const variable = range(request?.approvedVariableMin, request?.approvedVariableMax, currency)
  const fallback = range(job.compMin, job.compMax, job.currency ?? 'USD')

  return (
    <Frame dense>
      <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
        <div>
          <FrameTitle className="flex items-center gap-1.5">
            {copy.budget}
            <LockKeyhole className="size-3.5 text-muted-foreground" />
          </FrameTitle>
          <p className="text-xs text-muted-foreground">{copy.budgetDescription}</p>
        </div>
        {request?.id ? (
          <Link
            to="/ats/role-requests/$requestId"
            params={{ requestId: request.id }}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {copy.viewRequest}
            <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </FrameHeader>
      <FramePanel className="px-5 py-4">
        {base || variable || fallback ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <BudgetItem label={copy.base} value={base ?? fallback} />
            {variable ? <BudgetItem label={copy.variable} value={variable} /> : null}
            {request?.approvedEquityUnits != null ? (
              <BudgetItem
                label={copy.equity}
                value={request.approvedEquityUnits.toLocaleString('en-US')}
              />
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.noBudget}</p>
        )}
      </FramePanel>
    </Frame>
  )
}

function BudgetItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value ?? '—'}</dd>
    </div>
  )
}

function AuditItem({
  label,
  at,
  user,
}: {
  label: string
  at: string | null | undefined
  user?: JobDetail['createdBy']
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="space-y-1">
        <p title={formatDateTime(at)}>{formatDate(at)}</p>
        {user ? <UserLabel user={user} size="sm" className="text-muted-foreground" /> : null}
      </dd>
    </div>
  )
}
