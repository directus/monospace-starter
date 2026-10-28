import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  Uuid,
  departmentsCreateOneInput,
  emailTemplatesCreateOneInput,
  hiringLocationsCreateOneInput,
  jobLevelsCreateOneInput,
} from '@/generated/monospace'
import {
  candidatesCreateSchema,
  candidatesUpdateSchema,
  departmentsCreateSchema,
  departmentsUpdateSchema,
  emailTemplatesCreateSchema,
  emailTemplatesUpdateSchema,
  hiringLocationsCreateSchema,
  hiringLocationsUpdateSchema,
  jobLevelsCreateSchema,
  jobLevelsUpdateSchema,
} from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { UserError } from '@/lib/errors'
import { monospace } from '@/lib/monospace'
import { atsCopy } from '@/modules/ats/ats.copy'
import type { OpenRole } from '@/modules/ats/data/home'

const copy = atsCopy.home.openRoles.form

function invalidate(queryClient: QueryClient, groups: Array<string>) {
  return Promise.all(groups.map((group) => queryClient.invalidateQueries({ queryKey: [group] })))
}

export type Referral = {
  role: Pick<OpenRole, 'id' | 'firstStageId'>
  referrerUserId: Uuid
  firstName: string
  lastName: string
  email: string
  linkedinUrl: string
  why: string
}

// One profile per email (the unique index is on lower(email), and Monospace has no
// case-insensitive equals), so look it up loosely and compare here.
async function findCandidateByEmail(email: string) {
  const rows = await monospace.candidates.readMany({
    fields: ['id', 'firstName', 'lastName', 'email'],
    include: { applications: { fields: ['requisitionId'] } },
    filter: { email: { _icontains: email } },
    limit: 10,
  })

  return rows.find((row) => row.email?.toLowerCase() === email.toLowerCase()) ?? null
}

// A referral is a candidate with source "referral" credited to the signed-in user, an
// application in the job's first stage, and the referrer's note on the profile. An existing
// profile keeps its own source; it gets the application and the note.
export function useReferCandidate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (referral: Referral) => {
      const stageId = referral.role.firstStageId

      if (!stageId) throw new UserError(copy.noStages)

      const email = referral.email.trim()
      const name = `${referral.firstName.trim()} ${referral.lastName.trim()}`
      const note = `${copy.notePrefix}: ${referral.why.trim()}`
      const existing = await findCandidateByEmail(email)

      const application = {
        requisitions: { _connect: { key: { id: referral.role.id } } },
        interview_stages: { _connect: { key: { id: stageId } } },
      }

      if (existing?.id) {
        const existingName = [existing.firstName, existing.lastName].filter(Boolean).join(' ')

        if (existing.applications?.data.some((row) => row.requisitionId === referral.role.id)) {
          throw new UserError(copy.alreadyOnJob(existingName || name))
        }

        await monospace.candidates.updateOne({
          key: existing.id,
          data: candidatesUpdateSchema.parse({
            applications: [{ _create: { data: [application] } }],
            candidate_notes: [{ _create: { data: [{ body: note }] } }],
          }),
          fields: ['id'],
        })

        return { id: existing.id, name: existingName || name, existing: true }
      }

      const created = await monospace.candidates.createOne({
        data: candidatesCreateSchema.parse({
          firstName: referral.firstName.trim(),
          lastName: referral.lastName.trim(),
          email,
          linkedinUrl: referral.linkedinUrl.trim() || null,
          source: 'referral',
          referrerUserId: referral.referrerUserId,
          applications: [{ _create: { data: [application] } }],
          candidate_notes: [{ _create: { data: [{ body: note }] } }],
        }),
        fields: ['id'],
      })

      return { id: created.id, name, existing: false }
    },
    onSuccess: async ({ name, existing }) => {
      toast.success(existing ? copy.existing(name) : copy.sent(name))
      await invalidate(queryClient, ['candidates', 'applications', 'requisitions'])
    },
  })
}

// Settings lists: departments, job levels, hiring locations, email templates. Each is a small
// table edited in place, so one hook covers them, with a branch per collection for the write.

type SettingsCollection = 'departments' | 'jobLevels' | 'hiringLocations' | 'emailTemplates'

export type SettingsSave =
  | { collection: 'departments'; id?: Uuid; data: departmentsCreateOneInput }
  | { collection: 'jobLevels'; id?: Uuid; data: jobLevelsCreateOneInput }
  | { collection: 'hiringLocations'; id?: Uuid; data: hiringLocationsCreateOneInput }
  | { collection: 'emailTemplates'; id?: Uuid; data: emailTemplatesCreateOneInput }

// Departments and levels show up inside jobs, requests, and plans.
const dependents = {
  departments: ['requisitions', 'roleRequests', 'workforcePlanRoles'],
  jobLevels: ['requisitions', 'roleRequests', 'workforcePlanRoles'],
  hiringLocations: [],
  emailTemplates: [],
} satisfies Record<SettingsCollection, Array<string>>

async function saveRow(input: SettingsSave) {
  const { id } = input

  switch (input.collection) {
    case 'departments':
      await (id
        ? monospace.departments.updateOne({
            key: id,
            data: departmentsUpdateSchema.parse(input.data),
            fields: ['id'],
          })
        : monospace.departments.createOne({
            data: departmentsCreateSchema.parse(input.data),
            fields: ['id'],
          }))
      break
    case 'jobLevels':
      await (id
        ? monospace.jobLevels.updateOne({
            key: id,
            data: jobLevelsUpdateSchema.parse(input.data),
            fields: ['id'],
          })
        : monospace.jobLevels.createOne({
            data: jobLevelsCreateSchema.parse(input.data),
            fields: ['id'],
          }))
      break
    case 'hiringLocations':
      await (id
        ? monospace.hiringLocations.updateOne({
            key: id,
            data: hiringLocationsUpdateSchema.parse(input.data),
            fields: ['id'],
          })
        : monospace.hiringLocations.createOne({
            data: hiringLocationsCreateSchema.parse(input.data),
            fields: ['id'],
          }))
      break
    case 'emailTemplates':
      await (id
        ? monospace.emailTemplates.updateOne({
            key: id,
            data: emailTemplatesUpdateSchema.parse(input.data),
            fields: ['id'],
          })
        : monospace.emailTemplates.createOne({
            data: emailTemplatesCreateSchema.parse(input.data),
            fields: ['id'],
          }))
      break
  }
}

async function deleteRow(collection: SettingsCollection, id: Uuid) {
  switch (collection) {
    case 'departments':
      await monospace.departments.deleteOne({ key: id, fields: ['id'] })
      break
    case 'jobLevels':
      await monospace.jobLevels.deleteOne({ key: id, fields: ['id'] })
      break
    case 'hiringLocations':
      await monospace.hiringLocations.deleteOne({ key: id, fields: ['id'] })
      break
    case 'emailTemplates':
      await monospace.emailTemplates.deleteOne({ key: id, fields: ['id'] })
      break
  }
}

export function useSettingsMutations(collection: SettingsCollection, noun: string) {
  const queryClient = useQueryClient()
  const refresh = () => invalidate(queryClient, [collection, ...dependents[collection]])

  const save = useMutation({
    mutationFn: saveRow,
    onSuccess: async (_result, { id }) => {
      toast.success(id ? appCopy.toast.saved(noun) : appCopy.toast.created(noun))
      await refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (id: Uuid) => deleteRow(collection, id),
    onSuccess: async () => {
      toast.success(appCopy.toast.deleted(noun))
      await refresh()
    },
  })

  // Positions are unique, so a move writes one row: halfway between its new neighbours.
  const reorder = useMutation({
    mutationFn: async ({ id, position }: { id: Uuid; position: number }) => {
      if (collection === 'jobLevels') {
        await monospace.jobLevels.updateOne({ key: id, data: { position }, fields: ['id'] })
      } else if (collection === 'hiringLocations') {
        await monospace.hiringLocations.updateOne({ key: id, data: { position }, fields: ['id'] })
      }
    },
    onSettled: refresh,
  })

  return { save, remove, reorder }
}

export function movedPosition<T extends { id: Uuid; position?: number | null }>(
  rows: ReadonlyArray<T>,
  from: number,
  to: number,
) {
  const ordered = [...rows]
  const [row] = ordered.splice(from, 1)

  if (!row) return null

  ordered.splice(to, 0, row)

  const before = ordered[to - 1]?.position
  const after = ordered[to + 1]?.position

  const position =
    before == null ? (after ?? 0) - 1 : after == null ? before + 1 : (before + after) / 2

  return {
    id: row.id,
    position,
    ordered: ordered.map((item) => (item.id === row.id ? { ...item, position } : item)),
  }
}

export function nextPosition(rows: ReadonlyArray<{ position?: number | null }>) {
  return Math.max(0, ...rows.map((row) => row.position ?? 0)) + 1
}
