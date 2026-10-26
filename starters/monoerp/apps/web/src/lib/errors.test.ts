import { mapEngineError, MonospaceError } from '@monospace/sdk'
import { describe, expect, it } from 'vitest'

import { errorMessage, isMissingFromWorkspace, UserError } from '@/lib/errors'

describe('errorMessage', () => {
  it('shows messages written for the user', () => {
    expect(errorMessage(new UserError('A stage with this name already exists.'))).toBe(
      'A stage with this name already exists.',
    )
  })

  it('shows messages from Monospace', () => {
    expect(errorMessage(new MonospaceError('Value is too long.', 400))).toBe('Value is too long.')
  })

  it('hides messages from bugs', () => {
    expect(
      errorMessage(new TypeError('Cannot read properties of undefined'), 'Could not save.'),
    ).toBe('Could not save.')
  })
})

// Monospace's answers with a source removed from the workspace, and with its database down.
const unknownRelation = {
  message: 'Failed to execute query',
  source: {
    message:
      'Output validation failed:\n    - Unknown output field `stripeCustomer` at accountsCollectionOutput',
  },
}

const unknownCollection = {
  message: 'Failed to execute query',
  source: {
    message: 'Collection `accounts` not found',
    source: { message: 'Query validation failed' },
  },
}

const databaseDown = {
  message: 'Query failed',
  source: { message: 'Failed to connect to the database' },
}

describe('isMissingFromWorkspace', () => {
  it('spots a relation or collection the workspace does not have', () => {
    expect(isMissingFromWorkspace(mapEngineError(unknownRelation, 422))).toBe(true)
    expect(isMissingFromWorkspace(mapEngineError(unknownCollection, 422))).toBe(true)
  })

  it('leaves outages and other errors alone', () => {
    expect(isMissingFromWorkspace(mapEngineError(databaseDown, 500))).toBe(false)
    expect(isMissingFromWorkspace(new Error('Collection `accounts` not found'))).toBe(false)
    expect(isMissingFromWorkspace(null)).toBe(false)
  })
})
