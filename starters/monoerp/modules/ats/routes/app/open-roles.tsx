import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Briefcase, Clock, ExternalLink, MapPin, Megaphone, Search, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'

import { EntityAvatar } from '@/components/avatars'
import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Input } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/auth'
import { avatarUrl, ownerLabel } from '@/lib/users'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { ReferralDialog } from '@/modules/ats/components/home/referral-form'
import { myReferralsQuery, openRolesQuery, type OpenRole } from '@/modules/ats/data/home'

const copy = atsCopy.home.openRoles

export const Route = createFileRoute('/_app/ats/open-roles')({
  staticData: {
    page: {
      title: copy.navTitle,
      icon: Megaphone,
      module: 'ats',
      nav: 80,
      keywords: copy.keywords,
    },
  },
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    department: z.string().optional().catch(undefined),
  }),
  loader: async ({ context: { queryClient } }) => {
    await queryClient.query({ ...openRolesQuery(), staleTime: 'static' })
  },
  component: OpenRolesPage,
})

function OpenRolesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const roles = useQuery(openRolesQuery())
  const [referring, setReferring] = useState<OpenRole>()
  const q = search.q?.trim().toLowerCase() ?? ''

  const departments = useMemo(() => {
    const counts = new Map<string, number>()

    for (const role of roles.data ?? []) {
      const name = role.departments?.name

      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }

    return [...counts].sort((a, b) => a[0].localeCompare(b[0]))
  }, [roles.data])

  const shown = (roles.data ?? []).filter(
    (role) =>
      (!search.department || role.departments?.name === search.department) &&
      (!q ||
        [role.title, role.departments?.name, role.locations, role.job_levels?.name]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(q))),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/careers" target="_blank" rel="noreferrer" />}
          >
            {copy.viewCareers}
            <ExternalLink data-icon="inline-end" />
          </Button>
        }
      />
      {roles.isPending ? (
        <DataLoading rows={6} />
      ) : roles.isError ? (
        <DataError error={roles.error} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start">
              <div className="relative md:w-64">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label={copy.search}
                  placeholder={copy.search}
                  value={search.q ?? ''}
                  className="pl-9"
                  onChange={(event) =>
                    void navigate({
                      search: (previous) => ({ ...previous, q: event.target.value || undefined }),
                      replace: true,
                    })
                  }
                />
              </div>
              <div
                className="-m-1 flex min-w-0 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] md:flex-wrap"
                role="group"
                aria-label={copy.allDepartments}
              >
                <DepartmentChip
                  label={copy.allDepartments}
                  count={roles.data.length}
                  active={!search.department}
                  onClick={() =>
                    void navigate({
                      search: (previous) => ({ ...previous, department: undefined }),
                    })
                  }
                />
                {departments.map(([name, count]) => (
                  <DepartmentChip
                    key={name}
                    label={name}
                    count={count}
                    active={search.department === name}
                    onClick={() =>
                      void navigate({ search: (previous) => ({ ...previous, department: name }) })
                    }
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {copy.count(shown.length)}
            </p>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
                <div className="mb-3 rounded-xl bg-muted p-3">
                  <Briefcase className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {roles.data.length ? copy.emptyFiltered : copy.empty}
                </p>
                {roles.data.length ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => void navigate({ search: {} })}
                  >
                    {copy.clearFilters}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-3">
                {shown.map((role) => (
                  <RoleCard key={role.id} role={role} onRefer={() => setReferring(role)} />
                ))}
              </ul>
            )}
          </div>
          <MyReferrals />
        </div>
      )}
      <ReferralDialog role={referring} onOpenChange={(open) => !open && setReferring(undefined)} />
    </div>
  )
}

function DepartmentChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:h-10',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('text-xs tabular-nums', active ? 'opacity-85' : 'opacity-60')}>
        {count}
      </span>
    </button>
  )
}

function RoleCard({ role, onRefer }: { role: OpenRole; onRefer: () => void }) {
  const facts = [
    { icon: MapPin, value: role.locations },
    { icon: Clock, value: optionLabel('employmentType', role.employmentType) },
    { icon: Users, value: role.departments?.name },
  ].filter((fact) => fact.value)

  return (
    <li className="group rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">{role.title}</h2>
            {role.job_levels?.name ? (
              <Badge variant="secondary">{role.job_levels.name}</Badge>
            ) : null}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {facts.map(({ icon: Icon, value }) => (
              <li key={value} className="flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {value}
              </li>
            ))}
          </ul>
          {role.mustHaveSkills || role.description ? (
            <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground/90">
              {role.mustHaveSkills ? (
                <span className="font-medium text-foreground">{copy.mustHave}: </span>
              ) : null}
              {role.mustHaveSkills ?? role.description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs whitespace-nowrap text-muted-foreground">
            {role.hiringManager ? (
              <>
                <EntityAvatar
                  label={ownerLabel(role.hiringManager)}
                  image={avatarUrl(role.hiringManager.avatarId)}
                  variant="circle"
                />
                <span>
                  {copy.hiringManager}: {ownerLabel(role.hiringManager)}
                </span>
                <span aria-hidden className="max-sm:hidden">
                  ·
                </span>
              </>
            ) : null}
            <span className="font-mono">REQ-{role.reqNumber}</span>
            {role.openedAt ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {copy.opened} <RelativeTime value={role.openedAt} />
                </span>
              </>
            ) : null}
          </div>
        </div>
        <Button variant="outline" onClick={onRefer} className="max-sm:w-full">
          <Megaphone data-icon="inline-start" />
          {copy.refer}
        </Button>
      </div>
    </li>
  )
}

function MyReferrals() {
  const user = useCurrentUser()
  const referrals = useQuery(myReferralsQuery(user?.id))

  return (
    <Frame dense className="xl:sticky xl:top-4">
      <FramePanel>
        <FrameHeader className="px-4 pt-4 pb-2">
          <FrameTitle>{copy.myReferrals}</FrameTitle>
        </FrameHeader>
        {referrals.isPending ? (
          <DataLoading rows={2} className="px-4 pb-4" />
        ) : referrals.isError ? (
          <DataError error={referrals.error} className="m-4" />
        ) : referrals.data.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{copy.myReferralsEmpty}</p>
        ) : (
          <ul className="divide-y border-t">
            {referrals.data.map((referral) => {
              const name = [referral.firstName, referral.lastName].filter(Boolean).join(' ')

              return (
                <li key={referral.id} className="flex items-start gap-3 px-4 py-2.5">
                  <EntityAvatar label={name} variant="circle" className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {(referral.applications?.data ?? []).map((application) => (
                      <p key={application.id} className="truncate text-xs text-muted-foreground">
                        {application.status === 'active'
                          ? copy.referralStage(
                              application.requisitions?.title ?? '',
                              application.interview_stages?.name ?? '',
                            )
                          : `${application.requisitions?.title ?? ''} · ${optionLabel('applicationStatus', application.status)}`}
                      </p>
                    ))}
                  </div>
                  <RelativeTime
                    value={referral.createdAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                </li>
              )
            })}
          </ul>
        )}
      </FramePanel>
    </Frame>
  )
}
