import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { SelectionActions } from '@/components/bulk-bar'
import { BulkEditDrawer } from '@/components/bulk-edit-drawer'
import type { BulkField } from '@/components/bulk-edit-drawer'
import { DeleteDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'

// Edit-and-delete selection actions for a list page's toolbar, plus the edit drawer and the
// delete confirm, wired to whatever mutations the page hands in.
export function ListBulkActions({
  ids,
  noun,
  singular,
  fields,
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
  onClear: () => void
  onUpdate: (ids: Array<Uuid>, patch: Record<string, string | null>) => Promise<void>
  // Leave out to hide Delete (the user can't delete these records).
  onDelete?: (ids: Array<Uuid>) => Promise<void>
  deleting: boolean
  deleteError?: unknown
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <SelectionActions count={ids.length} onClear={onClear}>
        <Button
          variant="ghost"
          size="sm"
          className="max-md:pr-1.5"
          onClick={() => setEditing(true)}
        >
          <Pencil data-icon="inline-start" />
          <span className="max-md:sr-only">{appCopy.bulk.edit}</span>
        </Button>
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
