import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { useQuery } from '@tanstack/react-query'
import { GripVertical, Check, ListFilter, LockKeyhole, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading } from '@/components/data-state'
import { FormDialog } from '@/components/form/form-dialog'
import { PageHeader } from '@/components/page-header'
import { Empty } from '@/components/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { collectionPermissionsQuery, type CollectionPermissions } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { pipelineStagesQuery, type PipelineStage } from '@/modules/crm/data'
import {
  stageDraft,
  reorderedStage,
  stageFields,
  stageInput,
  useStageMutations,
  writableStageField,
  type StageDraft,
  type StageField,
} from '@/modules/crm/settings/pipeline-stage-data'
import { crmSettingsCopy } from '@/modules/crm/settings/settings.copy'
import { StagePreview } from '@/modules/crm/settings/stage-preview'
import { stageStyle } from '@/modules/crm/stage-color'

const copy = crmSettingsCopy.stages

const colors = [
  '#6366f1',
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#10b981',
  '#84cc16',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#64748b',
]

const outcomes = [
  { value: 'open', label: copy.open },
  { value: 'won', label: copy.won },
  { value: 'lost', label: copy.lost },
] as const

export function PipelineStagesSettings() {
  const user = useCurrentUser()
  const stages = useQuery(pipelineStagesQuery())
  const permissions = useQuery(collectionPermissionsQuery(user?.id, 'pipelineStages'))
  const { save, remove, reorder } = useStageMutations()
  const [editing, setEditing] = useState<{ stage?: PipelineStage }>()
  const [deleting, setDeleting] = useState<PipelineStage>()
  const [override, setOverride] = useState<PipelineStage[]>()
  const access = permissions.isError ? undefined : permissions.data
  const busy = save.isPending || remove.isPending || reorder.isPending
  const canCreate = writableStageField(access, 'name') && writableStageField(access, 'position')

  const canEdit = (stage: PipelineStage) =>
    Boolean(stage.id) &&
    stageFields.some((field) => field !== 'position' && writableStageField(access, field, stage))

  const readOnly = !access?.update && !access?.create && !access?.delete
  const visibleStages = override ?? stages.data ?? []
  const positionsVisible = visibleStages.every((stage) => stage.id && stage.position != null)

  const startEditing = (stage?: PipelineStage) => {
    save.reset()
    setEditing({ stage })
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          canCreate && stages.isSuccess ? (
            <Button disabled={busy} onClick={() => startEditing()}>
              <Plus />
              {copy.add}
            </Button>
          ) : undefined
        }
      />
      {permissions.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"
        >
          <p>{copy.permissionError}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={permissions.isFetching}
            onClick={() => void permissions.refetch()}
          >
            {copy.permissionRetry}
          </Button>
        </div>
      ) : permissions.isSuccess && readOnly ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" />
          <p>{copy.readOnly}</p>
        </div>
      ) : null}
      {stages.isPending ? (
        <DataLoading rows={6} />
      ) : stages.isError ? (
        <DataError error={stages.error} />
      ) : (
        <>
          {stages.data.length > 0 ? (
            <div className="space-y-6">
              <StagePreview stages={visibleStages} />
              <Frame dense>
                <FrameHeader className="flex-row items-center gap-2 px-4 py-3">
                  <FrameTitle>{copy.listTitle}</FrameTitle>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
                    {stages.data.length}
                  </span>
                  <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                    {reorder.isPending ? 'Saving order…' : copy.listDescription}
                  </p>
                </FrameHeader>
                <DragDropProvider
                  onDragEnd={(event) => {
                    if (event.canceled || busy || !access) return
                    const { source } = event.operation

                    if (!isSortable(source) || source.initialIndex === source.index) return
                    const from = source.initialIndex
                    const to = source.index

                    try {
                      const move = reorderedStage(stages.data, from, to)

                      if (!move) return
                      // Commit the new order before a fast rejection can batch it away.
                      flushSync(() => setOverride(move.ordered))
                      reorder.mutate(
                        { stages: stages.data, from, to, permissions: access },
                        {
                          onSettled: () => setOverride(undefined),
                        },
                      )
                    } catch (cause) {
                      toast.error(errorMessage(cause))
                    }
                  }}
                >
                  <FramePanel className="overflow-visible">
                    <ol
                      aria-label={copy.title}
                      className="divide-y [&>li:first-child]:rounded-t-xl [&>li:last-child]:rounded-b-xl"
                    >
                      {visibleStages.map((stage, index) => (
                        <StageRow
                          key={stage.id ?? index}
                          stage={stage}
                          index={index}
                          canDrag={
                            !busy &&
                            !editing &&
                            !deleting &&
                            positionsVisible &&
                            writableStageField(access, 'position', stage)
                          }
                          canEdit={!busy && canEdit(stage)}
                          canDelete={!busy && Boolean(access?.delete && stage.id)}
                          onEdit={() => startEditing(stage)}
                          onDelete={() => {
                            remove.reset()
                            setDeleting(stage)
                          }}
                        />
                      ))}
                      {canCreate ? (
                        <li>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => startEditing()}
                            className="flex w-full items-center gap-2 rounded-b-xl px-4 py-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            <span className="p-1">
                              <Plus className="size-4" />
                            </span>
                            {copy.add}
                          </button>
                        </li>
                      ) : null}
                    </ol>
                  </FramePanel>
                </DragDropProvider>
              </Frame>
              {reorder.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage(
                    reorder.error,
                    'Could not save the order. Your previous order has been restored.',
                  )}
                </p>
              ) : null}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <GripVertical className="size-4 shrink-0" />
                <p>
                  Drag a stage by its handle to move it. With a keyboard, press Space to pick up,
                  use arrow keys to move, then Space to drop.
                </p>
              </div>
            </div>
          ) : (
            <Empty
              className="px-6 py-16"
              title={copy.emptyTitle}
              icon={<ListFilter className="size-6" />}
            >
              <p>{copy.emptyDescription}</p>
              {canCreate ? (
                <Button disabled={busy} className="mt-5" onClick={() => startEditing()}>
                  <Plus />
                  {copy.add}
                </Button>
              ) : null}
            </Empty>
          )}
          {editing ? (
            <StageEditor
              key={editing.stage?.id ?? 'new'}
              stage={editing.stage}
              stages={stages.data}
              permissions={access}
              pending={save.isPending}
              error={save.isError ? errorMessage(save.error, copy.saveFailed) : undefined}
              onClose={() => setEditing(undefined)}
              onSave={(draft) => {
                if (!access || busy) return
                save.mutate(
                  { draft, stage: editing.stage, stages: stages.data, permissions: access },
                  { onSuccess: () => setEditing(undefined) },
                )
              }}
            />
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? 'stage'}?`}
        description={copy.deleteDescription}
        confirmLabel={copy.delete}
        pendingLabel="Deleting…"
        pending={remove.isPending}
        error={remove.isError ? copy.deleteFailed : undefined}
        onConfirm={() => {
          if (deleting?.id && access?.delete)
            remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }}
      />
    </div>
  )
}

function StageRow({
  stage,
  index,
  canDrag,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  stage: PipelineStage
  index: number
  canDrag: boolean
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: stage.id ?? `restricted-${index}`,
    index,
    type: 'pipeline-stage',
    accept: 'pipeline-stage',
    disabled: !canDrag,
  })

  return (
    <li
      ref={ref}
      aria-label={stage.name ?? copy.restricted}
      style={stageStyle(stage, index)}
      className={cn(
        'relative flex items-center gap-2 bg-card px-3 py-2 transition-[background-color,box-shadow] hover:bg-muted/20 motion-reduce:transition-none sm:gap-3 sm:px-4',
        isDragging && 'z-10 rounded-lg shadow-lg ring-2 ring-(--stage)',
      )}
    >
      <Button
        ref={handleRef}
        variant="ghost"
        size="icon-sm"
        aria-label={copy.moveStage(stage.name ?? copy.restricted)}
        disabled={!canDrag}
        className="-ml-1 shrink-0 cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
      >
        <GripVertical />
      </Button>
      <span className="hidden w-5 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:block">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="size-3 shrink-0 rounded-full bg-(--stage)" />
      <div className="min-w-0 flex-1">
        {canEdit ? (
          <button
            type="button"
            className="max-w-full truncate rounded text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:w-full pointer-coarse:py-2"
            onClick={onEdit}
          >
            {stage.name ?? copy.restricted}
          </button>
        ) : (
          <p className="truncate text-sm font-medium">{stage.name ?? copy.restricted}</p>
        )}
        <div className="mt-1 sm:hidden">
          <OutcomeBadge stage={stage} />
        </div>
      </div>
      <div className="hidden sm:block">
        <OutcomeBadge stage={stage} />
      </div>
      <div className="flex shrink-0 gap-1">
        {canEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.editStage(stage.name ?? copy.restricted)}
            onClick={onEdit}
          >
            <Pencil className="text-muted-foreground" />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.deleteStage(stage.name ?? copy.restricted)}
            onClick={onDelete}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function OutcomeBadge({ stage }: { stage: Pick<PipelineStage, 'isClosed' | 'isWon'> }) {
  if (stage.isClosed == null || stage.isWon == null) return null

  const outcome = outcomes.find(
    (item) => item.value === (stage.isClosed ? (stage.isWon ? 'won' : 'lost') : 'open'),
  )!

  return (
    <Badge
      variant={
        outcome.value === 'won' ? 'success' : outcome.value === 'lost' ? 'destructive' : 'secondary'
      }
      className="font-normal"
    >
      {outcome.label}
    </Badge>
  )
}

function StageEditor({
  stage,
  stages,
  permissions,
  pending,
  error,
  onClose,
  onSave,
}: {
  stage?: PipelineStage
  stages: PipelineStage[]
  permissions?: CollectionPermissions
  pending: boolean
  error?: string
  onClose: () => void
  onSave: (draft: StageDraft) => void
}) {
  const [initial] = useState(() => stageDraft(stage, stages))
  const [draft, setDraft] = useState(initial)
  const [acknowledged, setAcknowledged] = useState(false)
  const [validation, setValidation] = useState<string>()
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const outcomeChanged = Boolean(stage && draft.outcome !== initial.outcome)
  const can = (field: StageField) => !pending && writableStageField(permissions, field, stage)
  const canOutcome = can('isClosed') && can('isWon')

  const change = <K extends keyof StageDraft>(key: K, value: StageDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setValidation(undefined)

    if (key === 'outcome') setAcknowledged(false)
  }

  const close = () => {
    if (!pending) onClose()
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && close()}
      title={stage ? copy.edit : copy.add}
      description={
        stage ? 'Changes apply everywhere this stage is used.' : 'Give your team a clear next step.'
      }
      className="sm:max-w-lg"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()

          if (!permissions || pending || (outcomeChanged && !acknowledged)) return

          try {
            stageInput(draft, stages, permissions, stage)
            onSave(draft)
          } catch (cause) {
            setValidation(errorMessage(cause))
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="stage-name">{copy.name}</Label>
          <Input
            id="stage-name"
            value={draft.name}
            maxLength={80}
            disabled={!can('name')}
            placeholder="e.g. Qualified"
            onChange={(event) => change('name', event.target.value)}
          />
        </div>
        <fieldset disabled={!can('color')} className="space-y-3 disabled:opacity-50">
          <legend className="mb-2 text-sm font-medium">{copy.color}</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.colors}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={copy.useColor(color)}
                aria-pressed={draft.color.toLowerCase() === color}
                className="flex size-7 items-center justify-center rounded-full border border-black/5 transition-transform outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none pointer-coarse:size-10"
                style={{ backgroundColor: color }}
                onClick={() => change('color', color)}
              >
                {draft.color.toLowerCase() === color ? (
                  <Check className="size-3.5 text-white" />
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              aria-label={copy.customColor}
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : initial.color}
              onChange={(event) => change('color', event.target.value)}
              className="size-8 cursor-pointer rounded border bg-background p-0.5 pointer-coarse:size-10"
            />
            <Input
              aria-label={copy.hexColor}
              value={draft.color}
              maxLength={7}
              className="w-32 font-mono text-base md:text-xs"
              onChange={(event) => change('color', event.target.value)}
            />
          </div>
        </fieldset>
        <div className="space-y-2">
          <p id="stage-outcome-label" className="text-sm font-medium">
            {copy.outcome}
          </p>
          <RadioGroup
            aria-labelledby="stage-outcome-label"
            aria-describedby="stage-outcome-help"
            value={draft.outcome}
            disabled={!canOutcome}
            onValueChange={(value) => {
              const picked = outcomes.find((item) => item.value === value)

              if (picked) change('outcome', picked.value)
            }}
            className="grid-cols-3"
          >
            {outcomes.map(({ value, label }) => (
              <RadioGroupItem
                key={value}
                value={value}
                className="py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
          <p id="stage-outcome-help" className="text-xs text-muted-foreground">
            {copy.outcomeHelp}
          </p>
        </div>
        {outcomeChanged ? (
          <div className="space-y-3 rounded-lg border border-warning/25 bg-warning/5 p-3">
            <p className="text-sm">{copy.outcomeWarning}</p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acknowledged}
                disabled={pending}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
              />
              {copy.acknowledge}
            </label>
          </div>
        ) : null}
        {validation || error ? (
          <p role="alert" className="text-sm text-destructive">
            {validation ?? error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {copy.cancel}
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              !permissions ||
              (Boolean(stage) && !dirty) ||
              (outcomeChanged && !acknowledged)
            }
          >
            {pending ? copy.saving : stage ? copy.save : copy.add}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
