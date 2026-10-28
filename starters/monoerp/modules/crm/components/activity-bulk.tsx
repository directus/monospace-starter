import type { BulkField } from '@/components/form/bulk-edit-drawer'
import { ListBulkActions } from '@/components/list-bulk-actions'
import type { Uuid, activitiesUpdateOneInput } from '@/generated/monospace'
import { activitiesUpdateSchema } from '@/generated/monospace/schemas'
import { appCopy } from '@/lib/app.copy'
import { now } from '@/lib/dates'
import { useCollectionAccess } from '@/lib/permissions'
import { lookupUsers } from '@/lib/users'
import { crmCopy } from '@/modules/crm/crm.copy'
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
function toPatch(patch: Record<string, string | null>): activitiesUpdateOneInput {
  const data: activitiesUpdateOneInput = {}

  if (patch.dueAt) data.dueAt = data.occurredAt = patch.dueAt

  if (patch.status === 'completed') {
    data.status = 'completed'
    data.completedAt = now()
  } else if (patch.status === 'open') {
    data.status = 'open'
    data.completedAt = null
  }

  // The drawer hands back plain strings; the API's own schema checks the owner id.
  return activitiesUpdateSchema.parse(
    patch.ownerUserId ? { ...data, ownerUserId: patch.ownerUserId } : data,
  )
}

// Edit and Delete for selected activities, same variant as the other list pages.
export function ActivityBulkActions({ ids, onClear }: { ids: Array<Uuid>; onClear: () => void }) {
  const access = useCollectionAccess('activities')
  const editable = fields.filter((field) => access.canUpdate(field.name))
  const updateMany = useUpdateManyActivities()
  const deleteMany = useDeleteManyActivities()

  if (!editable.length && !access.delete) return null

  return (
    <ListBulkActions
      canUpdate={access.canUpdate}
      ids={ids}
      noun={copy.plural}
      singular={copy.singular}
      fields={editable}
      onClear={onClear}
      onUpdate={async (selected, patch) => {
        await updateMany.mutateAsync({ ids: selected, data: toPatch(patch) })
      }}
      onDelete={
        access.delete
          ? async (selected) => {
              await deleteMany.mutateAsync(selected)
            }
          : undefined
      }
      deleting={deleteMany.isPending}
      deleteError={deleteMany.error}
    />
  )
}
