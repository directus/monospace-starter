import { MonospaceError } from '@monospace/sdk'
import { useMutation } from '@tanstack/react-query'

import type { publicApplicationsCreateOneInput, Uuid } from '@/generated/monospace'
import { publicApplicationsCreateSchema } from '@/generated/monospace/schemas'
import { UserError } from '@/lib/errors'
import { monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.careers.form

export type Application = Omit<publicApplicationsCreateOneInput, 'requisitions' | 'consent'> & {
  jobId: Uuid
  consent: true
}

// The database trigger rejects a job that stopped taking applications (closed, or no stages).
function closedJob(error: MonospaceError) {
  let current: MonospaceError | undefined = error

  while (current) {
    if (/not taking applications|has no interview stages/i.test(current.message)) return true
    current = current.source
  }

  return false
}

// One row in public_applications. A trigger turns it into the candidate (new, or the existing
// one with this email), the application in the job's first stage, and the resume link. The
// public role can't read candidates, so nothing else comes back.
export function useSubmitApplication() {
  return useMutation({
    mutationFn: async ({ jobId, ...application }: Application) => {
      try {
        await monospace.publicApplications.createOne({
          data: publicApplicationsCreateSchema.parse({
            ...application,
            requisitions: { _connect: { key: { id: jobId } } },
          }),
          fields: ['id'],
        })
      } catch (error) {
        if (error instanceof MonospaceError && closedJob(error)) throw new UserError(copy.closed)
        throw error
      }
    },
  })
}
