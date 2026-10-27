import { Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { BulkEditDrawer } from '@/components/form/bulk-edit-drawer'
import type { BulkField } from '@/components/form/bulk-edit-drawer'
import { Button } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { lookupUsers } from '@/lib/users'

// Edit-and-delete selection actions for a list page's toolbar, plus the edit drawer and the
// delete confirm, wired to whatever mutations the page hands in.
export function ListBulkActions({
  ids,
  noun,
  singular,
  fields: availableFields,
  canUpdate,
  onClear,
  onUpdate,
  onDelete,
  deleting,
  deleteError,
}: {
  ids: Array<Uuid>
  // Plural and singular nouns for titles ("Edit 3 organizations", "Edit 1 organization").
  noun: string
  singular: string
  fields: Array<BulkField>
  canUpdate: (field: string) => boolean
  onClear: () => void
  onUpdate: (ids: Array<Uuid>, patch: Record<string, string | null>) => Promise<void>
  // Leave out to hide Delete (the user can't delete these records).
  onDelete?: (ids: Array<Uuid>) => Promise<void>
  deleting: boolean
  deleteError?: unknown
}) {
  const fields = availableFields.filter((field) => canUpdate(field.name))
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <SelectionActions count={ids.length} onClear={onClear}>
        {fields.length ? (
          <Button
            variant="ghost"
            size="sm"
            className="max-md:pr-1.5"
            onClick={() => setEditing(true)}
          >
            <Pencil data-icon="inline-start" />
            <span className="max-md:sr-only">{appCopy.bulk.edit}</span>
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive max-md:pr-1.5"
            onClick={() => setConfirming(true)}
          >
            <Trash2 data-icon="inline-start" />
            <span className="max-md:sr-only">{appCopy.common.delete}</span>
          </Button>
        ) : null}
      </SelectionActions>
      <BulkEditDrawer
        open={editing}
        onOpenChange={setEditing}
        count={ids.length}
        noun={noun}
        singular={singular}
        fields={fields}
        onApply={async (patch) => {
          await onUpdate(ids, patch)
          onClear()
        }}
      />
      <DeleteDialog
        open={confirming}
        onOpenChange={setConfirming}
        noun={noun}
        name={appCopy.bulk.deleteTitle(ids.length, noun, singular)}
        pending={deleting}
        error={deleteError ? errorMessage(deleteError, appCopy.form.deleteFailed) : undefined}
        onConfirm={() =>
          void onDelete?.(ids).then(() => {
            setConfirming(false)
            onClear()
          })
        }
      />
    </>
  )
}

// Replaces the list's identity while anything is selected: count, bulk actions, clear.
function SelectionActions({
  count,
  onClear,
  children,
}: {
  count: number
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="flex h-8 items-center gap-1 rounded-lg border bg-muted/40 pr-1 pl-3">
      <span className="text-sm font-medium tabular-nums">{appCopy.bulk.selected(count)}</span>
      <div className="mx-1 h-5 w-px bg-border" />
      {children}
      <Button variant="ghost" size="icon-sm" aria-label={appCopy.bulk.clear} onClick={onClear}>
        <X />
      </Button>
    </div>
  )
}

export function statusBulkField(
  options: Extract<BulkField, { kind: 'select' }>['options'],
): BulkField {
  return { name: 'status', label: appCopy.common.status, kind: 'select', options }
}

export const ownerBulkField: BulkField = {
  name: 'ownerUserId',
  label: appCopy.common.owner,
  kind: 'relation',
  search: lookupUsers,
  placeholder: appCopy.inline.assign,
  searchPlaceholder: appCopy.form.searchPlaceholder(appCopy.common.owner),
}
