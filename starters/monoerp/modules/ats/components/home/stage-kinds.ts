// Every job names its own stages, so cross-job views group by stage kind. One color per kind,
// in pipeline order, shared by the dashboard funnel and the per-job bars.
export const stageKinds = [
  'application',
  'screen',
  'interview',
  'debrief',
  'background_check',
  'offer',
  'hired',
] as const

const kindColors = new Map([
  ['application', 'var(--color-slate-400)'],
  ['screen', 'var(--color-sky-500)'],
  ['interview', 'var(--color-indigo-500)'],
  ['debrief', 'var(--color-violet-500)'],
  ['background_check', 'var(--color-amber-500)'],
  ['offer', 'var(--color-emerald-500)'],
  ['hired', 'var(--color-green-600)'],
])

export function kindColor(kind: string | null | undefined) {
  return kindColors.get(kind ?? '') ?? 'var(--color-slate-400)'
}

const sourceColors = new Map([
  ['referral', 'var(--color-emerald-500)'],
  ['sourced', 'var(--color-indigo-500)'],
  ['linkedin', 'var(--color-sky-500)'],
  ['website', 'var(--color-violet-500)'],
  ['job_board', 'var(--color-amber-500)'],
  ['agency', 'var(--color-rose-500)'],
  ['internal', 'var(--color-slate-400)'],
])

export function sourceColor(source: string) {
  return sourceColors.get(source) ?? 'var(--color-slate-400)'
}
