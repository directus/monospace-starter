import { CalendarOff } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { FramePanel } from '@/components/ui/frame'
import { useCollectionAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { affiliationSpan } from '@/modules/crm/affiliations'
import type { AffiliationGroup, AffiliationLike } from '@/modules/crm/affiliations'
import { crmCopy } from '@/modules/crm/crm.copy'

// One counterpart (organization on a contact, contact on an organization) with every title the
// contact has held there, in one panel. A single title keeps its menu on the header row; several
// get a small dot-and-line timeline under the name, current first, with a menu per entry.
export function AffiliationCard<T extends AffiliationLike>({
  label,
  group,
  onEdit,
  onEnd,
  onDelete,
  showPrimary = true,
}: {
  label: ReactNode
  group: AffiliationGroup<T>
  onEdit: (row: T) => void
  onEnd: (row: T) => void
  onDelete: (row: T) => void
  showPrimary?: boolean
}) {
  const [now] = useState(() => Date.now())
  const single = group.roles.length === 1 ? group.roles[0] : null

  return (
    <FramePanel className="px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{label}</div>
        <div className="flex shrink-0 items-center gap-1">
          {showPrimary && group.isPrimary ? (
            <Badge variant="secondary">{crmCopy.contacts.primary}</Badge>
          ) : null}
          {group.isFormer ? (
            <span className="text-xs text-muted-foreground">{crmCopy.contacts.former}</span>
          ) : null}
          {single ? (
            <RoleMenu row={single} onEdit={onEdit} onEnd={onEnd} onDelete={onDelete} />
          ) : null}
        </div>
      </div>
      {single ? null : (
        <ol className="mt-3 ml-1">
          {group.roles.map((row, index) => {
            const span = affiliationSpan(row, now)

            return (
              <li
                key={row.id ?? index}
                className="group/role relative grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-3.5 pb-4 last:pb-0"
              >
                <span
                  aria-hidden
                  className={cn(
                    'relative z-10 mt-[0.4375rem] size-2 rounded-full ring-2 ring-card',
                    row.endedAt ? 'bg-muted-foreground' : 'bg-foreground',
                  )}
                />
                <span
                  aria-hidden
                  className="absolute top-[0.6875rem] -bottom-[0.6875rem] left-[0.21875rem] w-px bg-border group-last/role:hidden"
                />
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 py-0.5">
                    <p
                      className={cn(
                        'truncate text-sm leading-5',
                        row.endedAt ? 'text-muted-foreground' : 'font-medium',
                      )}
                    >
                      {row.title ?? crmCopy.contacts.titleNotSet}
                    </p>
                    {span ? (
                      <p className="text-xs leading-5 text-muted-foreground">{span}</p>
                    ) : null}
                  </div>
                  <RoleMenu
                    row={row}
                    onEdit={onEdit}
                    onEnd={onEnd}
                    onDelete={onDelete}
                    className="-mt-0.5 -mr-2"
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </FramePanel>
  )
}

function RoleMenu<T extends AffiliationLike>({
  row,
  onEdit,
  onEnd,
  onDelete,
  className,
}: {
  row: T
  onEdit: (row: T) => void
  onEnd: (row: T) => void
  onDelete: (row: T) => void
  className?: string
}) {
  const access = useCollectionAccess('affiliations')

  return (
    <span className={cn('shrink-0', className)}>
      <RecordMenu
        size="icon-sm"
        variant="ghost"
        onEdit={access.canUpdate('title') ? () => onEdit(row) : undefined}
        onDelete={access.delete ? () => onDelete(row) : undefined}
      >
        {!row.endedAt && access.canUpdate('endedAt') && access.canUpdate('isPrimary') ? (
          <DropdownMenuItem onClick={() => onEnd(row)}>
            <CalendarOff />
            {crmCopy.contacts.affiliations.end}
          </DropdownMenuItem>
        ) : null}
      </RecordMenu>
    </span>
  )
}
