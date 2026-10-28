import { useQuery } from '@tanstack/react-query'
import { Globe, Lock, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataError, DataLoading } from '@/components/data-state'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { candidateNotesQuery } from '@/modules/ats/data/candidates'
import type { CandidateNote } from '@/modules/ats/data/candidates'
import { useCreateCandidateNote, useDeleteCandidateNote } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.notes

type Visibility = 'public' | 'private'

// The notes wall. Private notes (salary expectations and the like) are tinted and locked so
// they never read as shareable. Visibility is a label for the POC; access isn't enforced yet.
export function NotesPanel({ candidateId }: { candidateId: Uuid }) {
  const notes = useQuery(candidateNotesQuery(candidateId))
  const remove = useDeleteCandidateNote()
  const [deleting, setDeleting] = useState<CandidateNote>()

  return (
    <div className="space-y-5">
      <NoteComposer candidateId={candidateId} />
      {notes.isPending ? <DataLoading rows={3} /> : null}
      {notes.isError ? <DataError error={notes.error} /> : null}
      {notes.data?.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      ) : null}
      {notes.data?.length ? (
        <ul className="space-y-3">
          {notes.data.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={() => {
                remove.reset()
                setDeleting(note)
              }}
            />
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={copy.deleteTitle}
        description={copy.deleteDescription}
        confirmLabel={atsCopy.candidates.notes.deleteConfirm}
        pendingLabel={atsCopy.candidates.notes.deleting}
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }
      />
    </div>
  )
}

function NoteComposer({ candidateId }: { candidateId: Uuid }) {
  const create = useCreateCandidateNote()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const isPrivate = visibility === 'private'

  async function submit() {
    const text = body.trim()

    if (!text) return

    await create.mutateAsync({ candidateId, body: text, visibility })
    setBody('')
    setVisibility('public')
  }

  return (
    <form
      className={cn(
        'rounded-xl border bg-card shadow-xs transition-colors focus-within:ring-3 focus-within:ring-ring/30',
        isPrivate && 'border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20',
      )}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
        placeholder={copy.placeholder}
        aria-label={copy.placeholder}
        className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex flex-wrap items-center gap-2 border-t px-2 py-2">
        <div role="radiogroup" className="flex rounded-lg bg-muted p-0.5">
          {(['public', 'private'] as const).map((value) => {
            const Icon = value === 'private' ? Lock : Globe

            return (
              <Tooltip key={value}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      role="radio"
                      aria-checked={visibility === value}
                      onClick={() => setVisibility(value)}
                      className={cn(
                        'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        visibility === value && 'bg-background text-foreground shadow-xs',
                        visibility === value &&
                          value === 'private' &&
                          'text-amber-700 dark:text-amber-400',
                      )}
                    />
                  }
                >
                  <Icon className="size-3.5" />
                  {copy[value]}
                </TooltipTrigger>
                <TooltipContent>
                  {value === 'private' ? copy.privateHint : copy.publicHint}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={!body.trim() || create.isPending}
        >
          {create.isPending ? copy.adding : copy.add}
        </Button>
      </div>
      {create.isError ? (
        <p role="alert" className="px-3 pb-2 text-sm text-destructive">
          {errorMessage(create.error)}
        </p>
      ) : null}
    </form>
  )
}

function NoteCard({ note, onDelete }: { note: CandidateNote; onDelete: () => void }) {
  const isPrivate = note.visibility === 'private'

  return (
    <li
      className={cn(
        'group/note relative rounded-xl border bg-card px-4 py-3',
        isPrivate &&
          'border-amber-500/30 bg-amber-50/60 bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,rgb(245_158_11/0.04)_8px,rgb(245_158_11/0.04)_16px)] dark:bg-amber-950/20',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm">
        <UserAvatar user={note.createdBy} size="sm" />
        <span className="font-medium">
          {note.createdBy ? userName(note.createdBy) : copy.unknownAuthor}
        </span>
        <RelativeTime value={note.createdAt} className="text-xs text-muted-foreground" />
        {isPrivate ? (
          <Badge variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-300">
            <Lock />
            {copy.privateBadge}
          </Badge>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto text-muted-foreground opacity-0 transition-opacity group-hover/note:opacity-100 hover:text-destructive focus-visible:opacity-100 pointer-coarse:opacity-100"
          onClick={onDelete}
        >
          <Trash2 />
          <span className="sr-only">{copy.deleteTitle}</span>
        </Button>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
    </li>
  )
}
