import { z } from 'zod'

import { filterQuerySchema } from '@/lib/filters'

export const listSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  // `columnId.asc` or `columnId.desc`.
  sort: z
    .string()
    .regex(/^[\w-]+\.(asc|desc)$/)
    .optional()
    .catch(undefined),
  // Flat AND filters; old grouped URLs fall back to no filters.
  filters: filterQuerySchema.optional().catch(undefined),
  view: z.string().optional().catch(undefined),
  display: z.enum(['table', 'board']).optional().catch(undefined),
})

export function parseSort(value: string | undefined) {
  if (!value) return null
  const dot = value.lastIndexOf('.')

  return { id: value.slice(0, dot), desc: value.slice(dot + 1) === 'desc' }
}

export function serializeSort(sort: { id: string; desc: boolean } | null) {
  return sort ? `${sort.id}.${sort.desc ? 'desc' : 'asc'}` : undefined
}

export type ListSearch = z.infer<typeof listSearchSchema>
