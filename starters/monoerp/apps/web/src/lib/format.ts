import { appCopy } from '@/lib/app.copy'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

// Date-only values ("2025-10-01") are calendar dates, not instants. `new Date` would read them
// as UTC midnight and show the previous day west of Greenwich, so parse those as local.
export function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) return new Date(value)

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function formatDate(value: string | null | undefined) {
  return value ? dateFormatter.format(parseDate(value)) : ''
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })

export function formatMonth(value: string | null | undefined) {
  return value ? monthFormatter.format(parseDate(value)) : ''
}

export function formatDateTime(value: string | null | undefined) {
  return value ? dateTimeFormatter.format(new Date(value)) : ''
}

export function formatMoney(value: string | null | undefined, currency = 'USD') {
  if (value == null) return ''

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export function labelize(value: string | null | undefined) {
  if (!value) return ''

  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function initials(value: string, fallback = '') {
  const result = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return result || fallback
}

const DAY_MS = 86_400_000

export const timeOnly = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

// Short, relative phrasing for a due date: "3 days ago", "Today 10:00 AM", "Tomorrow 9:00 AM",
// "Fri 2:00 PM" within the week, then "Sep 12".
export function formatDue(value: string | null | undefined, now = Date.now()) {
  if (!value) return ''
  const date = new Date(value)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const days =
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
    DAY_MS

  if (days < -1) return appCopy.due.daysAgo(-days)

  if (days === -1) return appCopy.due.yesterday(timeOnly.format(date))

  if (days === 0) return appCopy.due.today(timeOnly.format(date))

  if (days === 1) return appCopy.due.tomorrow(timeOnly.format(date))

  if (days < 7) return `${weekday.format(date)} ${timeOnly.format(date)}`

  return monthDay.format(date)
}

const relativeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * DAY_MS],
  ['month', 30 * DAY_MS],
  ['week', 7 * DAY_MS],
  ['day', DAY_MS],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

// "3 hours ago", "yesterday", "in 22 days". Under a minute reads as "just now".
export function formatRelative(value: string | null | undefined, now = Date.now()) {
  if (!value) return ''
  const delta = parseDate(value).getTime() - now

  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= size) return relativeFormatter.format(Math.round(delta / size), unit)
  }

  return appCopy.common.justNow
}

export function enumLabel(labels: Record<string, string>, value: string | null | undefined) {
  return (value && labels[value]) || labelize(value)
}

export function optionsFrom(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }))
}
