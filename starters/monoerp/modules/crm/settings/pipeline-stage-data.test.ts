import { describe, expect, it } from 'vitest'

import { collectionPermissions } from '@/lib/permissions'
import type { PipelineStage } from '@/modules/crm/data'
import { reorderedStage, stageDraft, stageInput } from '@/modules/crm/settings/pipeline-stage-data'

const openStage = { color: '#6366f1', isClosed: false, isWon: false }

const stages: PipelineStage[] = [
  { ...openStage, id: '00000000-0000-4000-8006-000000000001', name: 'Discovery', position: 1 },
  { ...openStage, id: '00000000-0000-4000-8006-000000000002', name: 'Evaluation', position: 2 },
  { ...openStage, id: '00000000-0000-4000-8006-000000000003', name: 'Proposal', position: 3 },
]

describe('stage permissions and writes', () => {
  it('grants admin access and fails closed for malformed or missing policies', () => {
    expect(collectionPermissions([{ access: 'admin' }], 'stages').field('position').update).toBe(
      true,
    )

    const access = collectionPermissions(
      [null, { access: 'rules', itemRules: { stages: { update: false } } }],
      'stages',
    )

    expect(access.update).toBe(false)
    expect(access.field('name').update).toBe(false)
  })

  it('requires collection and field grants, combines roles, and omits denied fields from updates', () => {
    const access = collectionPermissions(
      [
        { access: 'rules', itemRules: { stages: { update: {} } } },
        { access: 'rules', fieldRules: { stages: { update: { name: {} } } } },
      ],
      'stages',
    )

    expect(access.field('name').update).toBe(true)
    expect(access.field('position').update).toBe(false)

    const draft = {
      ...stageDraft(stages[0], stages),
      name: 'Qualified',
      color: '#ef4444',
      position: '5',
      outcome: 'won' as const,
    }

    expect(stageInput(draft, stages, access, stages[0])).toEqual({ name: 'Qualified' })
    expect(access.create).toBe(false)
    expect(access.delete).toBe(false)
  })

  it('rejects duplicate names and preserves null colors on unrelated edits', () => {
    const access = collectionPermissions([{ access: 'admin' }], 'stages')
    const stage = { ...stages[0], color: null }
    expect(() =>
      stageInput({ ...stageDraft(stage, stages), name: 'evaluation' }, stages, access, stage),
    ).toThrow('already exists')
    expect(
      stageInput({ ...stageDraft(stage, stages), name: 'Qualified' }, stages, access, stage),
    ).toEqual({ name: 'Qualified' })
  })
})

describe('stage order', () => {
  it('moves only the dragged stage between its neighbors', () => {
    const move = reorderedStage(stages, 0, 1)!
    expect(move.position).toBe(2.5)
    expect(move.ordered.map((stage) => stage.name)).toEqual(['Evaluation', 'Discovery', 'Proposal'])
    expect(move.ordered.filter((stage) => stage.id !== move.stage.id)).toEqual([
      stages[1],
      stages[2],
    ])
    expect(stages[0].position).toBe(1)
  })

  it('handles the beginning, end, and cancelled moves', () => {
    expect(reorderedStage(stages, 2, 0)?.position).toBe(0)
    expect(reorderedStage(stages, 0, 2)?.position).toBe(4)
    expect(reorderedStage(stages, 1, 1)).toBeNull()
  })

  it('rejects missing positions and exhausted precision before a write', () => {
    expect(() =>
      reorderedStage([{ ...stages[0], position: null }, ...stages.slice(1)], 0, 1),
    ).toThrow('access')
    expect(() =>
      reorderedStage(
        [
          { ...stages[0], position: 0 },
          { ...stages[1], position: 1 },
          { ...stages[2], position: 1 + Number.EPSILON },
        ],
        0,
        1,
      ),
    ).toThrow('too closely spaced')
  })
})
