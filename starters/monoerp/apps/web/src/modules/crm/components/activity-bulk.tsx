import { ListBulkActions } from '@/components/list-bulk-actions'
import type { BulkField } from '@/components/bulk-edit-drawer'
import type { Uuid, interactionsUpdateOneInput } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { now } from '@/lib/dates'
import { interactionsUpdateSchema } from '@/generated/monospace/schemas'
import { crmCopy } from '@/modules/crm/crm.copy'
import { lookupUsers } from '@/lib/user-options'
import { useDeleteManyActivities, useUpdateManyActivities } from '@/modules/crm/mutations'

const copy = crmCopy.activity

const fields: Array<BulkField> = [
  { name: 'dueAt', label: copy.form.dueAt, kind: 'date' },
  {
    name: 'status',
    label: appCopy.common.status,
    kind: 'select',
    options: [
      { value: 'open', label: copy.statuses.open },
      { value: 'completed', label: copy.statuses.completed },
    ],
  },
  {
    name: 'ownerUserId',
    label: appCopy.common.owner,
    kind: 'relation',
    search: lookupUsers,
    placeholder: appCopy.inline.assign,
    searchPlaceholder: appCopy.form.searchPlaceholder(appCopy.common.owner),
  },
]

// A due date moves the occurrence with it (the task happens when it's due). Completing only
// stamps the completion time: History shows when something took place, not when it was ticked.
function toPatch(patch: Record<string, string | null>): interactionsUpdateOneInput {
  const data: interactionsUpdateOneInput = {}

  if (patch.dueAt) data.dueAt = data.occurredAt = patch.dueAt

  if (patch.status === 'completed') {
    data.status = 'completed'
    data.completedAt = now()
  } else if (patch.status === 'open') {
    data.status = 'open'
    data.completedAt = null
  }

  // The drawer hands back plain strings; the API's own schema checks the owner id.
  return interactionsUpdateSchema.parse(
    patch.ownerUserId ? { ...data, ownerUserId: patch.ownerUserId } : data,
  )
}

// Edit and Delete for selected activities, same shape as the other list pages.
export function ActivityBulkActions({ ids, onClear }: { ids: Array<Uuid>; onClear: () => void }) {
  const updateMany = useUpdateManyActivities()
  const deleteMany = useDeleteManyActivities()

  return (
    <ListBulkActions
      ids={ids}
      noun={copy.plural}
      singular={copy.singular}
      fields={fields}
      onClear={onClear}
      onUpdate={async (selected, patch) => {
        await updateMany.mutateAsync({ ids: selected, data: toPatch(patch) })
      }}
      onDelete={async (selected) => {
        await deleteMany.mutateAsync(selected)
      }}
      deleting={deleteMany.isPending}
      deleteError={deleteMany.error}
    />
  )
}
