import type { MonospaceObject, Value } from '@monospace/extension-kit/data-connector'
import { QueryRejected } from '@monospace/extension-kit/data-connector'

import type { StripeObject } from './client'
import type { FieldKind, FieldSpec, ResourceSpec } from './resources'
import { fieldPath } from './resources'

/** Converts a Stripe object to a record carrying every declared field in canonical encoding. */
export function toRecord(resource: ResourceSpec, object: StripeObject): MonospaceObject {
  return Object.fromEntries(resource.fields.map((field) => [field.name, readField(field, object)]))
}

export function project(record: MonospaceObject, select: readonly string[]): MonospaceObject {
  return Object.fromEntries(select.map((field) => [field, record[field] ?? null]))
}

function readField(field: FieldSpec, object: StripeObject): Value {
  let value: unknown = object

  for (const key of fieldPath(field)) {
    if (value === null || typeof value !== 'object') return null
    value = (value as Record<string, unknown>)[key]
  }

  if (value === undefined || value === null) return null

  // Stripe encodes timestamps as Unix seconds; Engine reads RFC 3339.
  if (field.kind === 'timestamp' && typeof value === 'number')
    return new Date(value * 1000).toISOString()

  // An expanded reference is an object; the declared field carries its id.
  if (field.kind === 'string' && typeof value === 'object' && !Array.isArray(value)) {
    return (value as { id?: string }).id ?? null
  }

  return value as Value
}

/**
 * A value made comparable in memory: timestamps as epoch milliseconds, everything else as sent.
 * `null` means SQL NULL.
 */
export function comparable(kind: FieldKind, value: Value): string | number | boolean | null {
  if (value === null) return null

  if (kind === 'timestamp') {
    const milliseconds = typeof value === 'string' ? Date.parse(value) : Number.NaN

    if (Number.isNaN(milliseconds))
      throw new QueryRejected(`\`${JSON.stringify(value)}\` is not an RFC 3339 timestamp.`)

    return milliseconds
  }

  if (typeof value === 'object') {
    throw new QueryRejected(`A ${kind} field cannot be compared with a structured value.`)
  }

  return value
}

/** Encodes one written value as Stripe form parameters. */
export function encodeFormValue(
  field: FieldSpec,
  value: Value,
  form: URLSearchParams,
  isUpdate: boolean,
): void {
  const key = field.formKey ?? field.name

  if (value === null) {
    // Stripe unsets a field with an empty string; a create simply omits it.
    if (isUpdate) form.set(key, '')

    return
  }

  if (typeof value === 'object') throw new QueryRejected(`\`${field.name}\` cannot be written.`)
  form.set(key, JSON.stringify(value))
}
