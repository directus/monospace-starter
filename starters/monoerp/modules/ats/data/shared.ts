// Reads every ATS area uses: list paging and sorting, the settings lists (departments, levels,
// locations), and people. Area reads live next to this file (jobs.ts, candidates.ts, ...).
import { queryOptions } from '@tanstack/react-query'

import type { RelationOption } from '@/components/form/relation-combobox'
import type { Uuid } from '@/generated/monospace'
import { keyed, monospace } from '@/lib/monospace'

async function fetchDepartments() {
  const rows = await monospace.departments.readMany({
    fields: ['id', 'name', 'headUserId', 'hasVariableComp'],
    sort: [{ name: { direction: 'asc' } }],
    limit: 200,
  })

  return keyed(rows)
}

export type Department = Awaited<ReturnType<typeof fetchDepartments>>[number]

export function departmentsQuery() {
  return queryOptions({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    staleTime: 5 * 60_000,
  })
}

async function fetchJobLevels() {
  const rows = await monospace.jobLevels.readMany({
    fields: ['id', 'name', 'track', 'position'],
    sort: [{ position: { direction: 'asc' } }],
    limit: 200,
  })

  return keyed(rows)
}

export type JobLevel = Awaited<ReturnType<typeof fetchJobLevels>>[number]

export function jobLevelsQuery() {
  return queryOptions({
    queryKey: ['jobLevels'],
    queryFn: fetchJobLevels,
    staleTime: 5 * 60_000,
  })
}

async function fetchHiringLocations() {
  const rows = await monospace.hiringLocations.readMany({
    fields: ['id', 'name', 'position'],
    sort: [{ position: { direction: 'asc' } }],
    limit: 200,
  })

  return keyed(rows)
}

export type HiringLocation = Awaited<ReturnType<typeof fetchHiringLocations>>[number]

export function hiringLocationsQuery() {
  return queryOptions({
    queryKey: ['hiringLocations'],
    queryFn: fetchHiringLocations,
    staleTime: 5 * 60_000,
  })
}

function matching<T extends { id: Uuid; name: string | null }>(rows: Array<T>, q: string) {
  const needle = q.trim().toLowerCase()

  return rows.flatMap((row): Array<RelationOption> =>
    !needle || row.name?.toLowerCase().includes(needle)
      ? [{ value: row.id, label: row.name ?? '' }]
      : [],
  )
}

function resolving<T extends { id: Uuid; name: string | null }>(rows: Array<T>, ids: Array<Uuid>) {
  const wanted = new Set(ids)

  return matching(
    rows.filter((row) => wanted.has(row.id)),
    '',
  )
}

export async function lookupDepartments(q: string) {
  return matching(await fetchDepartments(), q)
}

export async function resolveDepartments(ids: Array<Uuid>) {
  return resolving(await fetchDepartments(), ids)
}

export async function lookupJobLevels(q: string) {
  return matching(await fetchJobLevels(), q)
}

export async function resolveJobLevels(ids: Array<Uuid>) {
  return resolving(await fetchJobLevels(), ids)
}
