import { describe, expect, it } from 'vitest'

import {
  combineDateTime,
  defaultInterviewStart,
  fillTemplate,
  formatScorecardItems,
  parseScorecardItems,
  placeholderMeetUrl,
} from '@/modules/ats/components/interviews/interview-helpers'

describe('placeholderMeetUrl', () => {
  it('looks like a Meet code', () => {
    expect(placeholderMeetUrl()).toMatch(
      /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/,
    )
  })
})

describe('fillTemplate', () => {
  it('fills known placeholders and leaves unknown ones', () => {
    expect(
      fillTemplate('Hi {{ candidate_first_name }}, {{nope}}', { candidate_first_name: 'Ada' }),
    ).toBe('Hi Ada, {{nope}}')
  })
})

describe('combineDateTime', () => {
  it('reads local date and time inputs', () => {
    expect(combineDateTime('2026-10-15', '14:30')).toEqual(new Date(2026, 9, 15, 14, 30))
  })

  it('rejects an empty time', () => {
    expect(combineDateTime('2026-10-15', '')).toBeNull()
  })
})

describe('defaultInterviewStart', () => {
  it('skips the weekend', () => {
    // Friday Oct 16 2026 -> Monday Oct 19 at 10:00.
    expect(defaultInterviewStart(new Date(2026, 9, 16, 15))).toEqual(new Date(2026, 9, 19, 10))
  })
})

describe('scorecard items', () => {
  const items = [
    { point: 'Clear communicator', evidence: 'Walked through the migration plan', mitigation: '' },
    { point: 'Little Postgres', evidence: 'Mostly MySQL', mitigation: 'Pair with Sam' },
  ]

  it('round-trips', () => {
    expect(parseScorecardItems(formatScorecardItems(items))).toEqual(items)
  })

  it('drops empty items', () => {
    expect(formatScorecardItems([{ point: ' ', evidence: 'x', mitigation: '' }])).toBeNull()
  })

  it('reads free text as one item per line', () => {
    expect(parseScorecardItems('Great energy\n\n* Knows Vue')).toEqual([
      { point: 'Great energy', evidence: '', mitigation: '' },
      { point: 'Knows Vue', evidence: '', mitigation: '' },
    ])
  })
})
