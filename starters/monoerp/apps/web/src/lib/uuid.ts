import { notFound } from '@tanstack/react-router'
import { z } from 'zod'

import type { Uuid } from '@/generated/monospace'

const uuidFormat = z.uuid()

// z.uuid() checks the format but outputs a plain string; this predicate carries the SDK's Uuid type.
export function isUuid(value: string): value is Uuid {
  return uuidFormat.safeParse(value).success
}

export const uuidSchema = z.string().refine(isUuid, 'Expected a UUID')

// Path params are raw URL text; a malformed id is a missing record.
export function uuidParam(value: string) {
  if (!isUuid(value)) throw notFound()

  return value
}
