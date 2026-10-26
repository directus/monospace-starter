import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type {
  pipelineStagesCreateOneInput,
  pipelineStagesUpdateOneInput,
  Uuid,
} from '@/generated/monospace'
import { UserError } from '@/lib/errors'
import { monospace } from '@/lib/monospace'
import type { CollectionPermissions } from '@/lib/permissions'
import type { PipelineStage } from '@/modules/crm/data'
import { stageColor } from '@/modules/crm/stage-color'
import { crmSettingsCopy } from '@/modules/crm/settings/settings.copy'

export const stageFields = ['name', 'color', 'position', 'isClosed', 'isWon'] as const

export type StageField = (typeof stageFields)[number]

type StageFilter = NonNullable<Parameters<typeof monospace.pipelineStages.updateOne>[0]['filter']>

export type StageDraft = {
  name: string
  color: string
  position: string
  outcome: 'open' | 'won' | 'lost'
}

export function stageDraft(stage: PipelineStage | undefined, stages: PipelineStage[]): StageDraft {
  return {
    name: stage?.name ?? '',
    color: stageColor(stage ?? {}, stages.length),
    position: String(
      stage?.position ?? Math.max(0, ...stages.map((item) => item.position ?? 0)) + 1,
    ),
    outcome: stage?.isClosed ? (stage.isWon ? 'won' : 'lost') : 'open',
  }
}

export function writableStageField(
  permissions: CollectionPermissions | undefined,
  field: StageField,
  stage?: PipelineStage,
) {
  const action = stage ? 'update' : 'create'

  return Boolean(
    permissions?.[action] &&
    permissions.field(field)[action] &&
    (!stage || (stage[field] !== undefined && (field === 'color' || stage[field] !== null))),
  )
}

export function stageInput(
  draft: StageDraft,
  stages: PipelineStage[],
  permissions: CollectionPermissions,
  stage?: PipelineStage,
) {
  const data: pipelineStagesUpdateOneInput = {}
  const can = (field: StageField) => writableStageField(permissions, field, stage)

  if (can('name') && (!stage || draft.name.trim() !== stage.name)) {
    const name = draft.name.trim()

    if (!name || name.length > 80)
      throw new UserError('Use a stage name between 1 and 80 characters.')

    if (
      stages.some(
        (item) => item.id !== stage?.id && item.name?.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new UserError('A stage with this name already exists.')
    }

    data.name = name
  }

  if (can('position') && (!stage || Number(draft.position) !== stage.position)) {
    const position = Number(draft.position)

    if (!draft.position.trim() || !Number.isFinite(position)) {
      throw new UserError('Could not determine the stage position. Reload and try again.')
    }

    if (stages.some((item) => item.id !== stage?.id && item.position === position)) {
      throw new UserError('That position is already in use. Choose an unused number.')
    }

    data.position = position
  }

  if (can('color') && (!stage || draft.color !== stageDraft(stage, stages).color)) {
    if (!/^#[0-9a-f]{6}$/i.test(draft.color))
      throw new UserError('Use a six-digit hex color, such as #6366f1.')
    data.color = draft.color
  }

  if (can('isClosed') && can('isWon')) {
    const isClosed = draft.outcome !== 'open'
    const isWon = draft.outcome === 'won'

    if (!stage || isClosed !== stage.isClosed || isWon !== stage.isWon) {
      data.isClosed = isClosed
      data.isWon = isWon
    }
  }

  return data
}

export function stageCreateInput(
  draft: StageDraft,
  stages: PipelineStage[],
  permissions: CollectionPermissions,
): pipelineStagesCreateOneInput {
  const { name, position, ...rest } = stageInput(draft, stages, permissions)

  if (name === undefined || position === undefined) {
    throw new UserError('Creating a stage requires permission to set its name and position.')
  }

  return { ...rest, name, position }
}

// Matches the values this editor loaded for the fields it changes, so the update only applies if
// nobody else changed them since. Writable fields are never null here, except color.
function unchangedSince(stage: PipelineStage, data: pipelineStagesUpdateOneInput) {
  const filter: StageFilter = {}

  if (data.name !== undefined && stage.name !== null) filter.name = stage.name

  if (data.position !== undefined && stage.position !== null) filter.position = stage.position

  if (data.color !== undefined) filter.color = stage.color

  if (data.isClosed !== undefined && stage.isClosed !== null) filter.isClosed = stage.isClosed

  if (data.isWon !== undefined && stage.isWon !== null) filter.isWon = stage.isWon

  return filter
}

type SaveStage = {
  draft: StageDraft
  stages: PipelineStage[]
  permissions: CollectionPermissions
  stage?: PipelineStage
}

export function reorderedStage(stages: PipelineStage[], from: number, to: number) {
  if (from === to) return null

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= stages.length ||
    to >= stages.length
  ) {
    throw new UserError('Could not determine the new stage order.')
  }

  const ordered = [...stages]
  const [stage] = ordered.splice(from, 1)
  ordered.splice(to, 0, stage)

  if (
    ordered.some((item) => !item.id || item.position == null || !Number.isFinite(item.position))
  ) {
    throw new UserError('Reordering requires access to stage positions.')
  }

  const before = ordered[to - 1]?.position
  const after = ordered[to + 1]?.position
  const position = before == null ? after! - 1 : after == null ? before + 1 : before / 2 + after / 2

  if (
    !Number.isFinite(position) ||
    (before != null && position <= before) ||
    (after != null && position >= after)
  ) {
    throw new UserError(
      'These stages are too closely spaced to reorder. An administrator must rebalance their positions in Monospace.',
    )
  }

  return {
    stage,
    position,
    ordered: ordered.map((item) => (item.id === stage.id ? { ...item, position } : item)),
  }
}

export function useStageMutations() {
  const queryClient = useQueryClient()

  const refresh = () =>
    Promise.all(
      [
        'pipelineStages',
        'opportunities',
        'organizations',
        'contacts',
        'interactions',
        'command-palette',
      ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    )

  const save = useMutation({
    mutationFn: async ({ draft, stages, permissions, stage }: SaveStage) => {
      if (stage) {
        const data = stageInput(draft, stages, permissions, stage)

        if (!Object.keys(data).length) throw new UserError('No editable changes to save.')

        const result = await monospace.pipelineStages.updateOne({
          key: stage.id,
          data,
          filter: unchangedSince(stage, data),
          fields: ['id'],
        })

        if (!result?.id)
          throw new UserError(
            'This stage changed or is no longer editable. Close the editor and reload before trying again.',
          )
      } else {
        await monospace.pipelineStages.createOne({
          data: stageCreateInput(draft, stages, permissions),
          fields: ['id'],
        })
      }
    },
    onSuccess: async (_result, { stage }) => {
      toast.success(stage ? crmSettingsCopy.stages.saved : crmSettingsCopy.stages.created)
      await refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (id: Uuid) => monospace.pipelineStages.deleteOne({ key: id }),
    onSuccess: async () => {
      toast.success(crmSettingsCopy.stages.deleted)
      await refresh()
    },
  })

  const reorder = useMutation({
    mutationFn: async ({
      stages,
      from,
      to,
      permissions,
    }: {
      stages: PipelineStage[]
      from: number
      to: number
      permissions: CollectionPermissions
    }) => {
      const move = reorderedStage(stages, from, to)

      if (!move) return

      if (!writableStageField(permissions, 'position', move.stage) || !move.stage.id)
        throw new UserError('You do not have permission to reorder this stage.')

      const result = await monospace.pipelineStages.updateOne({
        key: move.stage.id,
        data: { position: move.position },
        filter: { position: move.stage.position! },
        fields: ['id'],
      })

      if (!result?.id)
        throw new UserError('This stage changed or is no longer editable. Reload and try again.')
    },
    onSuccess: () => {
      toast.success('Pipeline order updated')
    },
    onSettled: refresh,
  })

  return { save, remove, reorder }
}
