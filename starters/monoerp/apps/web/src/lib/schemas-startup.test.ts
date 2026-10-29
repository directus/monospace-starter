import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import * as schemas from '@/generated/monospace/schemas'

describe('generated write schemas', () => {
  // Building all of them when the module loads cost about a second before the first request.
  it('build on first use, not when the app loads', () => {
    const exported = z.array(z.instanceof(z.ZodType)).parse(Object.values(schemas))

    expect(exported.every((schema) => schema.def.type === 'lazy')).toBe(true)

    // No installed modules means no write schemas.
    expect(() => exported[0]?.safeParse({})).not.toThrow()
  })
})
