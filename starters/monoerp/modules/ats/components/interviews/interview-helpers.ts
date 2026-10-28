import { z } from 'zod'

// Pure helpers for scheduling and scorecards: the placeholder Meet link, filling email templates,
// local date and time inputs, and the text format scorecard positives and flags are stored in.

const MEET_LETTERS = 'abcdefghijkmnopqrstuvwxyz'

// Google Meet codes look like abc-defg-hij. Calendar isn't connected, so this only looks real.
export function placeholderMeetUrl(random: () => number = Math.random) {
  const part = (length: number) =>
    Array.from({ length }, () => MEET_LETTERS[Math.floor(random() * MEET_LETTERS.length)]).join('')

  return `https://meet.google.com/${part(3)}-${part(4)}-${part(3)}`
}

// Replaces {{name}} placeholders. Unknown ones stay as they are so a typo shows in the email.
export function fillTemplate(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => values[key] ?? match)
}

const pad = (value: number) => String(value).padStart(2, '0')

export function localDateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function localTimeInput(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// A date input ("2026-10-15") and a time input ("14:30") in local time, as an instant.
export function combineDateTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)

  if (!year || !month || !day || hours === undefined || minutes === undefined) return null

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null

  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

// The next weekday at 10:00, a sensible first slot to offer.
export function defaultInterviewStart(from = new Date()) {
  const date = new Date(from)
  date.setDate(date.getDate() + 1)

  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1)

  date.setHours(10, 0, 0, 0)

  return date
}

export type ScorecardItem = { point: string; evidence: string; mitigation: string }

const EVIDENCE = 'Evidence:'

const MITIGATION = 'Mitigation:'

// Stored as readable text so the columns still make sense in Studio:
//   - Point
//     Evidence: what they said
//     Mitigation: how we'd handle it
export function formatScorecardItems(items: ReadonlyArray<ScorecardItem>) {
  const lines = items
    .filter((item) => item.point.trim())
    .flatMap((item) => [
      `- ${item.point.trim()}`,
      ...(item.evidence.trim() ? [`  ${EVIDENCE} ${item.evidence.trim()}`] : []),
      ...(item.mitigation.trim() ? [`  ${MITIGATION} ${item.mitigation.trim()}`] : []),
    ])

  return lines.length ? lines.join('\n') : null
}

// Reads the format above. Text written any other way becomes one item per line.
export function parseScorecardItems(text: string | null | undefined): Array<ScorecardItem> {
  if (!text?.trim()) return []

  const items: Array<ScorecardItem> = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const current = items.at(-1)

    if (!line) continue

    if (current && line.startsWith(EVIDENCE)) {
      current.evidence = line.slice(EVIDENCE.length).trim()
    } else if (current && line.startsWith(MITIGATION)) {
      current.mitigation = line.slice(MITIGATION.length).trim()
    } else {
      items.push({ point: line.replace(/^[-*•]\s*/, ''), evidence: '', mitigation: '' })
    }
  }

  return items
}

export function candidateName(
  candidate: { firstName?: string | null; lastName?: string | null } | null | undefined,
) {
  return `${candidate?.firstName ?? ''} ${candidate?.lastName ?? ''}`.trim()
}

const fieldError = z.object({ message: z.string() })

// Field validators here return `{ message }`; TanStack Form types collected errors as `any`.
export function errorMessages(errors: ReadonlyArray<unknown>) {
  return errors.flatMap((error) => {
    const parsed = fieldError.safeParse(error)

    return parsed.success ? [parsed.data] : []
  })
}

// Offer, background check, and hired are stages a candidate passes through, not interviews.
const NOT_INTERVIEWS = new Set(['offer', 'background_check', 'hired'])

export function isInterviewStage(kind: string | null | undefined) {
  return !NOT_INTERVIEWS.has(kind ?? '')
}

type ApplicationStages = {
  status?: string | null
  interviewStageId?: string | null
  stages: ReadonlyArray<{ id: string; kind?: string | null; name?: string | null }>
}

export function currentStageOf(application: ApplicationStages | undefined) {
  return application?.stages.find((stage) => stage.id === application.interviewStageId)
}

// An active application whose current stage is an interview: worth suggesting a schedule.
export function readyToInterview(application: ApplicationStages) {
  return application.status === 'active' && isInterviewStage(currentStageOf(application)?.kind)
}
