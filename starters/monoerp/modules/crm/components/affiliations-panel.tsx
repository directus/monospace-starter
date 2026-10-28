import type { ReactNode } from 'react'
import { useState } from 'react'

import { DeleteDialog } from '@/components/confirm-dialog'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { todayInput } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import type { AffiliationGroup, AffiliationLike } from '@/modules/crm/affiliations'
import { AffiliationCard } from '@/modules/crm/components/affiliation-card'
import type { AffiliationInitial } from '@/modules/crm/components/affiliation-form'
import { AffiliationDrawer } from '@/modules/crm/components/affiliation-form'
import { crmCopy } from '@/modules/crm/crm.copy'
import { useDeleteAffiliation, useUpdateAffiliation } from '@/modules/crm/mutations'

export function AffiliationsPanel<T extends AffiliationLike & { id: Uuid }>({
  anchor,
  groups,
  title,
  actions,
  emptyMessage,
  label,
  toInitial,
  showPrimary = true,
  className,
}: {
  anchor: { contactId: Uuid } | { organizationId: Uuid }
  groups: Array<AffiliationGroup<T>>
  title: ReactNode
  actions: ReactNode
  emptyMessage: string
  label: (group: AffiliationGroup<T>) => ReactNode
  toInitial: (row: T) => AffiliationInitial
  showPrimary?: boolean
  className?: string
}) {
  const update = useUpdateAffiliation()
  const remove = useDeleteAffiliation()
  const [editing, setEditing] = useState<AffiliationInitial>()
  const [deleting, setDeleting] = useState<AffiliationInitial>()

  return (
    <>
      <Frame stacked dense className={className}>
        <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
          <FrameTitle>{title}</FrameTitle>
          {actions}
        </FrameHeader>
        {groups.length ? (
          groups.map((group) => (
            <AffiliationCard
              key={group.key}
              group={group}
              label={label(group)}
              showPrimary={showPrimary}
              onEdit={(row) => setEditing(toInitial(row))}
              onEnd={(row) =>
                update.mutate({ id: row.id, data: { endedAt: todayInput(), isPrimary: false } })
              }
              onDelete={(row) => {
                remove.reset()
                setDeleting(toInitial(row))
              }}
            />
          ))
        ) : (
          <FramePanel className="px-5 py-4">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </FramePanel>
        )}
      </Frame>
      {editing ? (
        <AffiliationDrawer
          {...anchor}
          key={editing.id}
          initial={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        noun={crmCopy.contacts.affiliations.singular}
        name={
          ('contactId' in anchor ? deleting?.organization?.label : deleting?.contact?.label) ?? ''
        }
        pending={remove.isPending}
        error={remove.isError ? errorMessage(remove.error, appCopy.form.deleteFailed) : undefined}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(undefined) })
        }}
      />
    </>
  )
}
