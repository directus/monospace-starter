import { noop, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FilePlus2, MoreHorizontal, Pencil, Plus, Send } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { z } from 'zod'

import { DataError, DataLoading } from '@/components/data-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { PlanLineDrawer } from '@/modules/ats/components/requests/plan-line-form'
import { PlanOverview } from '@/modules/ats/components/requests/plan-overview'
import { PlanStatusBadge } from '@/modules/ats/components/requests/request-badges'
import { RoleRequestDrawer } from '@/modules/ats/components/requests/role-request-form'
import { workforcePlanQuery } from '@/modules/ats/data/requests'
import type { PlanLine } from '@/modules/ats/data/requests'
import { WorkforcePlanIcon } from '@/modules/ats/icons'
import { useSubmitPlanLines } from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.plan

const THIS_YEAR = new Date().getFullYear()

const YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]

const searchSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/ats/workforce-plan')({
  staticData: {
    page: {
      title: copy.title,
      icon: WorkforcePlanIcon,
      module: 'ats',
      nav: 70,
      keywords: copy.keywords,
      fullWidth: true,
    },
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ year: search.year ?? THIS_YEAR }),
  loader: async ({ context: { queryClient }, deps }) => {
    await queryClient.query({ ...workforcePlanQuery(deps.year), staleTime: 'static' }).catch(noop)
  },
  component: WorkforcePlanPage,
})

// Lines that can go (back) to VP Operations.
const submittable = (line: PlanLine) => line.status === 'draft' || line.status === 'declined'

type Group = { id: string; name: string; head: string | null; lines: Array<PlanLine> }

function groupByDepartment(lines: ReadonlyArray<PlanLine>) {
  const groups = new Map<string, Group>()

  for (const line of lines) {
    const id = line.departmentId ?? 'none'

    const group = groups.get(id) ?? {
      id,
      name: line.departments?.name ?? appCopy.fallback.unknown,
      head: line.departmentHead ? userName(line.departmentHead) : null,
      lines: [],
    }

    group.lines.push(line)
    groups.set(id, group)
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function totals(lines: ReadonlyArray<PlanLine>) {
  return {
    current: lines.reduce((total, line) => total + (line.currentHeadcount ?? 0), 0),
    planned: lines.reduce((total, line) => total + (line.plannedHeadcount ?? 0), 0),
    approved: lines.reduce((total, line) => total + (line.approvedHeadcount ?? 0), 0),
    budget: lines.reduce((total, line) => total + Number(line.budgetAmount ?? 0), 0),
    currency: lines.find((line) => line.budgetAmount)?.currency ?? 'USD',
  }
}

function WorkforcePlanPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const year = search.year ?? THIS_YEAR
  const plan = useQuery(workforcePlanQuery(year))
  const submit = useSubmitPlanLines()
  const isMobile = useIsMobile()
  const [selected, setSelected] = useState<Set<Uuid>>(new Set())
  const [editing, setEditing] = useState<PlanLine | 'new'>()
  const [requesting, setRequesting] = useState<Uuid>()

  const lines = useMemo(() => plan.data ?? [], [plan.data])
  const groups = useMemo(() => groupByDepartment(lines), [lines])
  const selectedIds = lines.filter((line) => selected.has(line.id) && submittable(line))

  const toggle = (id: Uuid, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous)

      if (on) next.add(id)
      else next.delete(id)

      return next
    })

  const lineActions = {
    edit: (line: PlanLine) => setEditing(line),
    request: (line: PlanLine) => setRequesting(line.id),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy.title}
        description={copy.description(year)}
        actions={
          <>
            <Select
              items={YEARS.map((value) => ({ value: String(value), label: String(value) }))}
              value={String(year)}
              onValueChange={(value) => {
                setSelected(new Set())
                void navigate({ search: { year: Number(value) } })
              }}
            >
              <SelectTrigger className="w-24" aria-label={copy.year}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!selectedIds.length || submit.isPending}
              title={selectedIds.length ? undefined : copy.selectDraft}
              onClick={() =>
                submit.mutate(
                  selectedIds.map((line) => line.id),
                  { onSuccess: () => setSelected(new Set()) },
                )
              }
            >
              <Send data-icon="inline-start" />
              {submit.isPending ? copy.submitting : copy.submit(selectedIds.length)}
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" />
              {copy.addLine}
            </Button>
          </>
        }
      />

      {plan.isPending ? <DataLoading rows={8} /> : null}
      {plan.isError ? <DataError error={plan.error} /> : null}

      {plan.data && !lines.length ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <WorkforcePlanIcon className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">{copy.empty(year)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.emptyHint}</p>
          <Button className="mt-4" onClick={() => setEditing('new')}>
            <Plus data-icon="inline-start" />
            {copy.addLine}
          </Button>
        </div>
      ) : null}

      {lines.length ? (
        <>
          <PlanOverview lines={lines} />
          {isMobile ? (
            <PlanCards
              groups={groups}
              selected={selected}
              onToggle={toggle}
              actions={lineActions}
            />
          ) : (
            <PlanTable
              groups={groups}
              all={lines}
              selected={selected}
              onToggle={toggle}
              actions={lineActions}
            />
          )}
        </>
      ) : null}

      <PlanLineDrawer
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        year={year}
        line={editing === 'new' ? undefined : editing}
      />
      <RoleRequestDrawer
        open={requesting !== undefined}
        onOpenChange={(open) => !open && setRequesting(undefined)}
        planLineId={requesting}
      />
    </div>
  )
}

type LineActions = { edit: (line: PlanLine) => void; request: (line: PlanLine) => void }

function LineMenu({ line, actions }: { line: PlanLine; actions: LineActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={(event) => event.stopPropagation()} />
        }
      >
        <MoreHorizontal />
        <span className="sr-only">{appCopy.common.actions}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => actions.edit(line)}>
          <Pencil />
          {copy.editLine}
        </DropdownMenuItem>
        {line.status === 'approved' ? (
          <DropdownMenuItem onClick={() => actions.request(line)}>
            <FilePlus2 />
            {copy.requestRole}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const NUMBER = 'text-right tabular-nums'

function PlanTable({
  groups,
  all,
  selected,
  onToggle,
  actions,
}: {
  groups: Array<Group>
  all: ReadonlyArray<PlanLine>
  selected: Set<Uuid>
  onToggle: (id: Uuid, on: boolean) => void
  actions: LineActions
}) {
  const grand = totals(all)
  const columns = copy.columns

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-10 pl-4" />
            <TableHead>{columns.role}</TableHead>
            <TableHead>{columns.level}</TableHead>
            <TableHead className={NUMBER}>{columns.current}</TableHead>
            <TableHead className={NUMBER}>{columns.planned}</TableHead>
            <TableHead className={NUMBER}>{columns.approved}</TableHead>
            <TableHead>{columns.hireType}</TableHead>
            <TableHead>{columns.locations}</TableHead>
            <TableHead className={NUMBER}>{columns.budget}</TableHead>
            <TableHead>{columns.status}</TableHead>
            <TableHead className="w-10 pr-4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const subtotal = totals(group.lines)

            return (
              <Fragment key={group.id}>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableCell colSpan={11} className="pt-4 pb-2 pl-4">
                    <span className="font-semibold">{group.name}</span>
                    {group.head ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {copy.head(group.head)}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
                {group.lines.map((line) => (
                  <TableRow
                    key={line.id}
                    className="cursor-pointer"
                    onClick={() => actions.edit(line)}
                  >
                    <TableCell className="pl-4" onClick={(event) => event.stopPropagation()}>
                      {submittable(line) ? (
                        <Checkbox
                          checked={selected.has(line.id)}
                          onCheckedChange={(on) => onToggle(line.id, on)}
                          aria-label={line.roleName ?? ''}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate font-medium">{line.roleName}</div>
                      {line.team ? (
                        <div className="truncate text-xs text-muted-foreground">{line.team}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {line.job_levels?.name ?? ''}
                    </TableCell>
                    <TableCell className={NUMBER}>{line.currentHeadcount}</TableCell>
                    <TableCell className={NUMBER}>{line.plannedHeadcount}</TableCell>
                    <TableCell
                      className={cn(
                        NUMBER,
                        line.approvedHeadcount == null && 'text-muted-foreground',
                      )}
                    >
                      {line.approvedHeadcount ?? '–'}
                    </TableCell>
                    <TableCell>
                      <div>{optionLabel('hireType', line.hireType)}</div>
                      <div className="text-xs text-muted-foreground">
                        {optionLabel('employmentType', line.employmentType)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">
                      {line.locations}
                    </TableCell>
                    <TableCell className={NUMBER}>
                      {formatMoney(line.budgetAmount, line.currency ?? 'USD')}
                    </TableCell>
                    <TableCell>
                      <PlanStatusBadge status={line.status} />
                    </TableCell>
                    <TableCell className="pr-4" onClick={(event) => event.stopPropagation()}>
                      <LineMenu line={line} actions={actions} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-b-2 text-muted-foreground hover:bg-transparent">
                  <TableCell />
                  <TableCell colSpan={2} className="text-xs font-medium tracking-wide uppercase">
                    {copy.subtotal}
                  </TableCell>
                  <TableCell className={NUMBER}>{subtotal.current}</TableCell>
                  <TableCell className={NUMBER}>{subtotal.planned}</TableCell>
                  <TableCell className={NUMBER}>{subtotal.approved}</TableCell>
                  <TableCell colSpan={2} />
                  <TableCell className={NUMBER}>
                    {formatMoney(String(subtotal.budget), subtotal.currency)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </Fragment>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell />
            <TableCell colSpan={2} className="font-semibold">
              {copy.total}
            </TableCell>
            <TableCell className={NUMBER}>{grand.current}</TableCell>
            <TableCell className={NUMBER}>{grand.planned}</TableCell>
            <TableCell className={NUMBER}>{grand.approved}</TableCell>
            <TableCell colSpan={2} />
            <TableCell className={NUMBER}>
              {formatMoney(String(grand.budget), grand.currency)}
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function PlanCards({
  groups,
  selected,
  onToggle,
  actions,
}: {
  groups: Array<Group>
  selected: Set<Uuid>
  onToggle: (id: Uuid, on: boolean) => void
  actions: LineActions
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const subtotal = totals(group.lines)

        return (
          <section key={group.id} className="space-y-2">
            <header className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{group.name}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {copy.columns.planned} {subtotal.planned} · {copy.columns.approved}{' '}
                {subtotal.approved} · {formatMoney(String(subtotal.budget), subtotal.currency)}
              </span>
            </header>
            <ul className="divide-y rounded-xl border">
              {group.lines.map((line) => (
                <li key={line.id} className="flex items-start gap-3 p-3">
                  {submittable(line) ? (
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(line.id)}
                      onCheckedChange={(on) => onToggle(line.id, on)}
                      aria-label={line.roleName ?? ''}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => actions.edit(line)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{line.roleName}</span>
                      <PlanStatusBadge status={line.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[
                        line.job_levels?.name,
                        line.team,
                        optionLabel('employmentType', line.employmentType),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-1 text-xs tabular-nums">
                      {copy.columns.current} {line.currentHeadcount} · {copy.columns.planned}{' '}
                      {line.plannedHeadcount} · {copy.columns.approved}{' '}
                      {line.approvedHeadcount ?? '–'}
                      {line.budgetAmount
                        ? ` · ${formatMoney(line.budgetAmount, line.currency ?? 'USD')}`
                        : ''}
                    </p>
                  </button>
                  <LineMenu line={line} actions={actions} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
