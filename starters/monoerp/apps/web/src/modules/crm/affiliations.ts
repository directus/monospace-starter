import { formatMonth, parseDate } from '@/lib/format'
import { crmCopy } from '@/modules/crm/crm.copy'

// A contact can hold several roles at the same organization over time. The UI shows the
// organization (or contact) once, LinkedIn-style, with the role history underneath.

export type AffiliationLike = {
  id?: string | null
  title?: string | null
  startedAt?: string | null
  endedAt?: string | null
  isPrimary?: boolean | null
}

export type AffiliationGroup<T extends AffiliationLike> = {
  key: string
  // Open role to lead with: primary first, then most recently started.
  current: T | null
  // Every role at this counterpart, newest first.
  roles: Array<T>
  isPrimary: boolean
  isFormer: boolean
}

export function isCurrentAffiliation(row: AffiliationLike) {
  return !row.endedAt
}

function byStartDesc(a: AffiliationLike, b: AffiliationLike) {
  return (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
}

// Open roles first (primary ahead), then ended roles by most recent end.
function byRecency(a: AffiliationLike, b: AffiliationLike) {
  const aOpen = isCurrentAffiliation(a)
  const bOpen = isCurrentAffiliation(b)

  if (aOpen !== bOpen) return aOpen ? -1 : 1

  if (aOpen && Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1

  if (!aOpen) return (b.endedAt ?? '').localeCompare(a.endedAt ?? '')

  return byStartDesc(a, b)
}

// "Jan 2019 – Dec 2022 · 3 yrs 11 mos", "Feb 2026 – Present · 8 mos", "Until Dec 2022", or
// nothing when undated. `now` is passed in so rendering stays pure.
export function affiliationSpan(row: AffiliationLike, now?: number) {
  const from = formatMonth(row.startedAt)
  const to = formatMonth(row.endedAt)
  const copy = crmCopy.contacts.affiliations
  const length = now === undefined ? null : tenure(row, now)
  const suffix = length ? ` · ${length}` : ''

  if (from && to) return copy.span(from, to) + suffix

  if (from) return copy.span(from, copy.present) + suffix

  if (to) return copy.until(to)

  return null
}

// Whole months between start and end (or now), LinkedIn-style: "8 mos", "1 yr", "2 yrs 10 mos".
function tenure(row: AffiliationLike, now: number) {
  return tenureBetween(row.startedAt, row.endedAt, now)
}

// Overall time at one counterpart: earliest start to latest end, or now if any role is open.
export function groupTenure<T extends AffiliationLike>(group: AffiliationGroup<T>, now: number) {
  const byText = (a: string, b: string) => a.localeCompare(b)
  const starts = group.roles.flatMap((row) => (row.startedAt ? [row.startedAt] : [])).sort(byText)
  const ends = group.roles.flatMap((row) => (row.endedAt ? [row.endedAt] : [])).sort(byText)

  if (!starts.length) return null

  return tenureBetween(starts[0], group.isFormer ? ends.at(-1) : null, now)
}

function tenureBetween(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
  now: number,
) {
  if (!startedAt) return null
  const start = parseDate(startedAt)
  const end = endedAt ? parseDate(endedAt) : new Date(now)

  const months = Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth(),
  )

  if (months < 1) return null
  const copy = crmCopy.contacts.affiliations
  const years = Math.floor(months / 12)
  const rest = months % 12

  return [years ? copy.years(years) : null, rest ? copy.months(rest) : null]
    .filter(Boolean)
    .join(' ')
}

export function groupAffiliations<T extends AffiliationLike>(
  rows: Array<T>,
  keyOf: (row: T) => string | null | undefined,
): Array<AffiliationGroup<T>> {
  const groups = new Map<string, Array<T>>()

  for (const row of rows) {
    const key = keyOf(row)

    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  return [...groups.entries()]
    .map(([key, roles]) => {
      const sorted = [...roles].sort(byRecency)
      const open = sorted.filter(isCurrentAffiliation)
      const current = open[0] ?? null

      return {
        key,
        current,
        roles: sorted,
        isPrimary: Boolean(current?.isPrimary),
        isFormer: open.length === 0,
      }
    })
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1

      if (a.isFormer !== b.isFormer) return a.isFormer ? 1 : -1

      return byStartDesc(a.roles[0] ?? {}, b.roles[0] ?? {})
    })
}

// Title to show for a group: the current role's, else the most recent one.
export function groupTitle<T extends AffiliationLike>(group: AffiliationGroup<T>) {
  return (group.current ?? group.roles[0])?.title ?? null
}
