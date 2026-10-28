import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Clock, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormDialog } from '@/components/form/form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { StageKindDot, stageKindStyle } from '@/modules/ats/components/jobs/job-badges'
import type { InterviewStage, PipelineApplication } from '@/modules/ats/data/jobs'
import { useCreateStage, useDeleteStage, useUpdateStage } from '@/modules/ats/mutations/jobs'

const copy = atsCopy.jobs.plan

const kinds = Object.entries(atsCopy.options.stageKind).map(([value, label]) => ({ value, label }))

// Fractional positions, as in settings/pipeline-stage-data.ts: a moved stage takes the midpoint
// of its new neighbours, so one row changes.
function reordered(stages: Array<InterviewStage>, from: number, to: number) {
  const ordered = [...stages]
  const [stage] = ordered.splice(from, 1)

  if (!stage) return null
  ordered.splice(to, 0, stage)
  const before = ordered[to - 1]?.position
  const after = ordered[to + 1]?.position

  const position =
    before == null ? (after ?? 1) - 1 : after == null ? before + 1 : before / 2 + after / 2

  if ((before != null && position <= before) || (after != null && position >= after)) return null

  return {
    stage,
    position,
    ordered: ordered.map((item) => (item.id === stage.id ? { ...item, position } : item)),
  }
}

export function InterviewPlan({
  jobId,
  stages,
  applications,
}: {
  jobId: Uuid
  stages: Array<InterviewStage>
  applications: Array<PipelineApplication>
}) {
  const create = useCreateStage()
  const update = useUpdateStage()
  const reorder = useUpdateStage({ notify: false })
  const remove = useDeleteStage()
  const [editing, setEditing] = useState<{ stage?: InterviewStage }>()
  const [deleting, setDeleting] = useState<InterviewStage>()
  const [override, setOverride] = useState<Array<InterviewStage>>()
  const visible = override ?? stages
  const busy = create.isPending || update.isPending || reorder.isPending || remove.isPending

  const counts = new Map<string, number>()

  for (const application of applications) {
    const id = application.interviewStageId

    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h2 className="text-base font-semibold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button disabled={busy} onClick={() => setEditing({})}>
          <Plus data-icon="inline-start" />
          {copy.add}
        </Button>
      </div>
      <Frame dense>
        <FrameHeader className="flex-row items-center gap-2 px-4 py-3">
          <FrameTitle>{copy.title}</FrameTitle>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {stages.length}
          </span>
        </FrameHeader>
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled || busy) return
            const { source } = event.operation

            if (!isSortable(source) || source.initialIndex === source.index) return
            const move = reordered(stages, source.initialIndex, source.index)

            if (!move) {
              toast.error(copy.tooClose)

              return
            }

            flushSync(() => setOverride(move.ordered))
            reorder.mutate(
              { id: move.stage.id, data: { position: move.position } },
              {
                onError: (error) => toast.error(errorMessage(error, copy.reorderFailed)),
                onSettled: () => setOverride(undefined),
              },
            )
          }}
        >
          <FramePanel className="overflow-visible">
            <ol
              aria-label={copy.title}
              className="divide-y [&>li:first-child]:rounded-t-xl [&>li:last-child]:rounded-b-xl"
            >
              {visible.map((stage, index) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  index={index}
                  count={counts.get(stage.id) ?? 0}
                  canDrag={!busy && !editing && !deleting}
                  onEdit={() => {
                    update.reset()
                    setEditing({ stage })
                  }}
                  onDelete={() => {
                    remove.reset()
                    setDeleting(stage)
                  }}
                />
              ))}
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    create.reset()
                    setEditing({})
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span className="p-1">
                    <Plus className="size-4" />
                  </span>
                  {copy.add}
                </button>
              </li>
            </ol>
          </FramePanel>
        </DragDropProvider>
      </Frame>
      {editing ? (
        <StageEditor
          key={editing.stage?.id ?? 'new'}
          stage={editing.stage}
          pending={create.isPending || update.isPending}
          error={
            create.isError || update.isError
              ? errorMessage(create.error ?? update.error, appCopy.form.saveFailed)
              : undefined
          }
          onClose={() => setEditing(undefined)}
          onSave={(draft) => {
            const done = { onSuccess: () => setEditing(undefined) }

            if (editing.stage) {
              update.mutate({ id: editing.stage.id, data: draft }, done)

              return
            }

            const last = stages.at(-1)?.position ?? 0
            create.mutate({ requisitionId: jobId, ...draft, position: Math.floor(last) + 1 }, done)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={copy.deleteTitle(deleting?.name ?? '')}
        description={copy.deleteDescription}
        confirmLabel={copy.delete}
        pendingLabel={copy.deleting}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }}
      />
    </div>
  )
}

function StageRow({
  stage,
  index,
  count,
  canDrag,
  onEdit,
  onDelete,
}: {
  stage: InterviewStage
  index: number
  count: number
  canDrag: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: stage.id,
    index,
    type: 'interview-stage',
    accept: 'interview-stage',
    disabled: !canDrag,
  })

  return (
    <li
      ref={ref}
      aria-label={stage.name ?? undefined}
      style={stageKindStyle(stage.kind)}
      className={cn(
        'relative flex items-center gap-2 bg-card px-3 py-2 transition-[background-color,box-shadow] hover:bg-muted/20 motion-reduce:transition-none sm:gap-3 sm:px-4',
        isDragging && 'z-10 rounded-lg shadow-lg ring-2 ring-(--stage)',
      )}
    >
      <Button
        ref={handleRef}
        variant="ghost"
        size="icon-sm"
        aria-label={copy.move(stage.name ?? '')}
        disabled={!canDrag}
        className="-ml-1 shrink-0 cursor-grab touch-none text-muted-foreground/60 active:cursor-grabbing"
      >
        <GripVertical />
      </Button>
      <span className="hidden w-5 shrink-0 text-center font-mono text-xs text-muted-foreground/70 sm:block">
        {String(index + 1).padStart(2, '0')}
      </span>
      <StageKindDot kind={stage.kind} className="size-3" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="max-w-full truncate rounded text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2"
        >
          {stage.name}
        </button>
        <p className="flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
          {optionLabel('stageKind', stage.kind)}
          {stage.slaDays != null ? <span>· {copy.slaValue(stage.slaDays)}</span> : null}
        </p>
      </div>
      <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
        {optionLabel('stageKind', stage.kind)}
      </Badge>
      <span className="hidden w-20 items-center gap-1 text-xs text-muted-foreground tabular-nums sm:flex">
        <Clock className="size-3" />
        {stage.slaDays != null ? copy.slaValue(stage.slaDays) : copy.noSla}
      </span>
      <span className="hidden w-24 text-right text-xs text-muted-foreground tabular-nums md:block">
        {copy.candidates(count)}
      </span>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${appCopy.common.edit} ${stage.name ?? ''}`}
          onClick={onEdit}
        >
          <Pencil className="text-muted-foreground" />
        </Button>
        {count ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.delete}
                    disabled
                    className="pointer-events-none"
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </span>
              }
            />
            <TooltipContent>{copy.deleteBlocked}</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label={copy.delete} onClick={onDelete}>
            <Trash2 className="text-muted-foreground" />
          </Button>
        )}
      </div>
    </li>
  )
}

type StageDraft = { name: string; kind: string; slaDays: number | null }

function StageEditor({
  stage,
  pending,
  error,
  onClose,
  onSave,
}: {
  stage?: InterviewStage
  pending: boolean
  error?: string
  onClose: () => void
  onSave: (draft: StageDraft) => void
}) {
  const [name, setName] = useState(stage?.name ?? '')
  const [kind, setKind] = useState(stage?.kind ?? 'interview')
  const [sla, setSla] = useState(stage?.slaDays != null ? String(stage.slaDays) : '')
  const [validation, setValidation] = useState<string>()

  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && !pending && onClose()}
      title={stage ? copy.edit : copy.add}
      className="sm:max-w-md"
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = name.trim()
          const slaDays = sla.trim() ? Number(sla) : null

          if (!trimmed) return setValidation(copy.nameRequired)

          if (slaDays != null && (!Number.isInteger(slaDays) || slaDays < 0)) {
            return setValidation(copy.slaInvalid)
          }

          onSave({ name: trimmed, kind, slaDays })
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="stage-name">{copy.name}</Label>
          <Input
            id="stage-name"
            value={name}
            maxLength={80}
            autoFocus
            placeholder={copy.namePlaceholder}
            onChange={(event) => {
              setName(event.target.value)
              setValidation(undefined)
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{copy.kind}</Label>
            <Select items={kinds} value={kind} onValueChange={(next) => next && setKind(next)}>
              <SelectTrigger aria-label={copy.kind} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <StageKindDot kind={option.value} className="size-2" />
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage-sla">{copy.slaDays}</Label>
            <Input
              id="stage-sla"
              inputMode="numeric"
              value={sla}
              placeholder={copy.noSla}
              onChange={(event) => {
                setSla(event.target.value)
                setValidation(undefined)
              }}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{copy.slaHelp}</p>
        {validation || error ? (
          <p role="alert" className="text-sm text-destructive">
            {validation ?? error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            {appCopy.common.cancel}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? copy.saving : stage ? copy.save : copy.add}
          </Button>
        </DialogFooter>
      </form>
    </FormDialog>
  )
}
