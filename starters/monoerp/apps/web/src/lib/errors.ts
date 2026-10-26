import { MonospaceError, MonospacePermissionError } from '@monospace/sdk'

import { appCopy } from '@/lib/app.copy'

// A failure the user can act on, with a message written for them. Anything else that gets thrown
// is a bug, and its message stays out of the UI.
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

// Monospace errors are server responses, so their messages are expected and safe to show.
export function isExpectedError(error: Error) {
  return error instanceof UserError || error instanceof MonospaceError
}

export function reportUnexpectedError(error: Error) {
  if (!isExpectedError(error)) console.error(error)
}

// Monospace wraps database errors several levels deep, so walk the chain for a known cause.
function hasCause(error: MonospaceError, pattern: RegExp) {
  let current: MonospaceError | undefined = error

  while (current) {
    if (pattern.test(current.message)) return true
    current = current.source
  }

  return false
}

// Monospace refuses a query that names a collection or relation the workspace doesn't have,
// which is how a data source that was never connected, or was removed, looks from the app.
export function isMissingFromWorkspace(error: Error | null) {
  return (
    error instanceof MonospaceError &&
    error.status === 422 &&
    hasCause(error, /unknown output field|collection `[^`]+` not found/i)
  )
}

// Turns an SDK or unknown error into a sentence the user can act on. Takes `unknown` because
// it's where caught values get narrowed: JavaScript can throw anything.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function errorMessage(error: unknown, fallback: string = appCopy.form.saveFailed) {
  if (error instanceof MonospacePermissionError) return appCopy.form.permissionDenied

  if (error instanceof MonospaceError) {
    if (error.status === 409 || hasCause(error, /foreign key constraint/i)) {
      return appCopy.form.conflict
    }

    if (hasCause(error, /unique constraint|duplicate key/i)) return appCopy.form.duplicate
  }

  if (error instanceof Error && isExpectedError(error) && error.message) return error.message

  return fallback
}
