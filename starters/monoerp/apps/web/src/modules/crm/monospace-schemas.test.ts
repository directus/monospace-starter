import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  organizationsCreateOneInput,
  organizationsUpdateOneInput,
} from '@/generated/monospace'
import { organizationsCreateSchema, organizationsUpdateSchema } from '@/generated/monospace/schemas'

describe('generated Monospace Zod schemas', () => {
  it('validates organization create input using the live API contract', () => {
    expect(organizationsCreateSchema.safeParse({ name: 'Acme' }).success).toBe(true)

    const missingName = organizationsCreateSchema.safeParse({})
    expect(missingName.success).toBe(false)

    if (!missingName.success) {
      expect(missingName.error.issues[0]?.path).toEqual(['name'])
    }

    expect(organizationsCreateSchema.safeParse({ name: 'Acme', id: 'not-a-uuid' }).success).toBe(
      false,
    )
    expect(organizationsCreateSchema.safeParse({ name: 'Acme', domain: null }).success).toBe(true)

    expectTypeOf(organizationsCreateSchema).toMatchTypeOf<
      import('zod').ZodType<organizationsCreateOneInput>
    >()
  })

  it('generates a partial organization update schema', () => {
    expect(organizationsUpdateSchema.safeParse({}).success).toBe(true)

    expectTypeOf(organizationsUpdateSchema).toMatchTypeOf<
      import('zod').ZodType<organizationsUpdateOneInput>
    >()
  })
})
