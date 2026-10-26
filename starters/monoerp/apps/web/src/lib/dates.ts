// Converters between API ISO strings and the values native date inputs understand.

export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : ''
}

export function toDateTimeInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return local.toISOString().slice(0, 16)
}

export function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

export function todayInput() {
  return toDateTimeInput(new Date().toISOString()).slice(0, 10)
}

// The current instant, for completion stamps and "log it as of right now".
export function now() {
  return new Date().toISOString()
}

export function nowInput() {
  return toDateTimeInput(new Date().toISOString())
}

// Quick reschedule targets, at 9:00 local time on a later day.
export function atNine(daysFromNow: number) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(9, 0, 0, 0)

  return date.toISOString()
}

// "Later today": the next round hour at least 30 minutes out, so a default is never already
// overdue. Late in the evening this still lands today; the user can push it to tomorrow.
export function laterToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() + 30, 0, 0)
  date.setHours(date.getHours() + 1, 0, 0, 0)

  return date.toISOString()
}

// Next Monday at 9:00, not "seven days from now".
export function nextWeek() {
  const date = new Date()
  const daysUntilMonday = (8 - date.getDay()) % 7 || 7
  date.setDate(date.getDate() + daysUntilMonday)
  date.setHours(9, 0, 0, 0)

  return date.toISOString()
}

export function fromDateInput(value: string) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 9, 0, 0, 0)

  return date.toISOString()
}
