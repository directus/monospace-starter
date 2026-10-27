import { formatDue } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { Link } from '@tanstack/react-router'
import { CalendarDays, CircleCheck, Loader2, Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'

import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { now } from '@/lib/dates'
import type { OwnerLike } from '@/lib/users'
import { cn } from '@/lib/utils'
import { contactName } from '@/modules/crm/activity'
import { activityIcons } from '@/modules/crm/components/activity-form'
import { DueChip } from '@/modules/crm/components/activity-composer'
import { ContactAvatar, OrganizationAvatar } from '@/modules/crm/components/entities'
import { OwnerPopover } from '@/modules/crm/components/owner-popover'
import { crmCopy } from '@/modules/crm/crm.copy'
import { DealIcon } from '@/modules/crm/icons'
import type { ActivityRecord } from '@/modules/crm/data'
import { useUpdateActivity } from '@/modules/crm/mutations'

const copy = crmCopy.activity

export type LinkedRecord = 'organization' | 'contact' | 'deal'

export type RowHandlers = {
  onOpen: (row: ActivityRecord) => void
  onEdit: (row: ActivityRecord) => void
  onDelete: (row: ActivityRecord) => void
  onFilterOwner?: (user: OwnerLike) => void
  // Linked records to leave out of the row (the page's own record).
  hide?: ReadonlyArray<LinkedRecord>
  // Horizontal padding for rows and group headers.
  inset?: string
}

export const LIST_INSET = 'px-5 sm:px-6'

// One row for every activity list: To do, History, and the record pages. Fixed slots so the
// eye can drop straight down a column: select (when offered), type, subject (grows, hover
// actions pinned at its end), context, when, owner. Everything responsive is driven by the list's own width,
// not the viewport: below 28rem the date drops under the subject, below 42rem there is no
// context slot, from 42rem one pill in 12rem, from 64rem two pills in 20rem. The subject is
// never truncated to make room for chips.
const GRID =
  'grid grid-cols-[1rem_1rem_minmax(0,1fr)_7.5rem_1.5rem] items-center gap-3 @max-md:grid-cols-[1rem_1rem_minmax(0,1fr)_1.5rem] @max-md:gap-y-0.5 @2xl:grid-cols-[1rem_1rem_minmax(0,1fr)_12rem_7.5rem_1.5rem] @5xl:grid-cols-[1rem_1rem_minmax(0,1fr)_20rem_7.5rem_1.5rem]'

const GRID_NO_SELECT =
  'grid grid-cols-[1rem_minmax(0,1fr)_7.5rem_1.5rem] items-center gap-3 @max-md:grid-cols-[1rem_minmax(0,1fr)_1.5rem] @max-md:gap-y-0.5 @2xl:grid-cols-[1rem_minmax(0,1fr)_12rem_7.5rem_1.5rem] @5xl:grid-cols-[1rem_minmax(0,1fr)_20rem_7.5rem_1.5rem]'

export function ActivityRow({
  row,
  mode,
  overdue = false,
  selected = false,
  onSelect,
  when,
  handlers,
}: {
  row: ActivityRecord
  mode: 'todo' | 'history'
  overdue?: boolean
  selected?: boolean
  onSelect?: (on: boolean) => void
  // History's date text; To do renders its own due control.
  when?: string
  handlers: RowHandlers
}) {
  const access = useCollectionAccess('interactions')
  const update = useUpdateActivity()
  const Icon = activityIcons[row.type ?? 'note'] ?? CalendarDays

  return (
    <div
      className={cn(
        'group/row h-11 cursor-pointer transition-colors hover:bg-muted/50 @max-md:h-auto @max-md:py-2',
        onSelect ? GRID : GRID_NO_SELECT,
        handlers.inset ?? LIST_INSET,
        selected && 'bg-muted/40',
      )}
      onClick={(event) => {
        const { target } = event

        if (
          target instanceof Element &&
          target.closest('button, a, [role="checkbox"], [role="menu"], [role="dialog"]')
        ) {
          return
        }

        handlers.onOpen(row)
      }}
    >
      {onSelect ? (
        <Checkbox
          aria-label={copy.bulk.select}
          checked={selected}
          onCheckedChange={(on) => onSelect(Boolean(on))}
        />
      ) : null}
      <Icon className="size-4 text-muted-foreground" />
      <div className="flex min-w-0 items-center gap-1">
        <p className="min-w-0 truncate text-sm font-medium">
          {row.subject ?? copy.untitled}
          {row.status === 'cancelled' ? (
            <Badge variant="outline" className="ml-2 align-middle">
              {copy.statuses.cancelled}
            </Badge>
          ) : null}
        </p>
        {row.attachments?.data.length ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
            <Paperclip className="size-3" />
            {row.attachments.data.length}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 @max-md:-my-1.5 [@media(hover:hover)]:opacity-0">
          {mode === 'todo' && access.canUpdate('status') && access.canUpdate('completedAt') ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copy.sheet.completeNow}
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        id: row.id ?? '',
                        data: { status: 'completed', completedAt: now() },
                      })
                    }
                  />
                }
              >
                {update.isPending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
              </TooltipTrigger>
              <TooltipContent>{copy.sheet.completeNow}</TooltipContent>
            </Tooltip>
          ) : null}
          <RecordMenu
            size="icon-sm"
            variant="ghost"
            onEdit={access.canUpdate('subject') ? () => handlers.onEdit(row) : undefined}
            onDelete={access.delete ? () => handlers.onDelete(row) : undefined}
          />
        </div>
      </div>
      <div className="hidden min-w-0 items-center gap-1.5 @2xl:flex">
        <ContextPills row={row} hide={handlers.hide ?? []} />
      </div>
      <div
        className={cn(
          'flex justify-end @max-md:col-[-3/-2] @max-md:row-start-2 @max-md:justify-start @max-md:*:h-auto',
          mode === 'todo' && '@max-md:-ml-1',
        )}
      >
        {mode === 'todo' && access.canUpdate('dueAt') && access.canUpdate('occurredAt') ? (
          <DueChip
            variant="text"
            value={row.dueAt ?? row.occurredAt ?? null}
            overdue={overdue}
            pending={update.isPending}
            onChange={(next) =>
              update.mutate({
                id: row.id ?? '',
                data: { dueAt: next, occurredAt: next ?? undefined },
              })
            }
          />
        ) : (
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
            {mode === 'todo' ? formatDue(row.dueAt) : when}
          </span>
        )}
      </div>
      <OwnerPopover user={row.owner} onFilter={handlers.onFilterOwner} />
    </div>
  )
}

// Left-aligned pills in priority order: deal, contact, organization, minus whatever the page
// already is. Two at most, and the second only once the list is wide enough. Same look for
// every kind: small avatar or logo, then name.
function ContextPills({ row, hide }: { row: ActivityRecord; hide: ReadonlyArray<LinkedRecord> }) {
  const deal = row.opportunities
  const organization = row.organizations
  const contact = row.contacts

  const person =
    contactName(row) ??
    `${crmCopy.contacts.restrictedName.first} ${crmCopy.contacts.restrictedName.last}`

  const wanted: Array<LinkedRecord> = []

  if (deal?.id && !hide.includes('deal')) wanted.push('deal')

  if (contact?.id && !hide.includes('contact')) wanted.push('contact')

  if (!wanted.includes('deal') && organization?.id && !hide.includes('organization')) {
    wanted.push('organization')
  }

  const shown = wanted.slice(0, 2)
  const showDeal = shown.includes('deal')
  const showContact = shown.includes('contact')
  const showOrganization = shown.includes('organization')

  // First pill takes the slot alone below 64rem; the second joins it above.
  const pillClass = (kind: LinkedRecord) =>
    shown[0] === kind ? 'max-w-full @5xl:max-w-[60%]' : 'hidden max-w-[60%] @5xl:inline-flex'

  return (
    <>
      {showDeal && deal?.id ? (
        <Pill
          to="/crm/deals/$dealId"
          params={{ dealId: deal.id }}
          label={deal.title ?? crmCopy.deals.restricted}
          avatar={<DealIcon className="size-3.5 shrink-0 text-muted-foreground" />}
          className={pillClass('deal')}
        />
      ) : null}
      {showOrganization && organization?.id ? (
        <Pill
          to="/crm/organizations/$organizationId"
          params={{ organizationId: organization.id }}
          label={organization.name ?? crmCopy.organizations.restricted}
          avatar={<OrganizationAvatar organization={organization} size="sm" className="size-4" />}
          className={pillClass('organization')}
        />
      ) : null}
      {showContact && contact?.id ? (
        <Pill
          to="/crm/contacts/$contactId"
          params={{ contactId: contact.id }}
          label={person}
          avatar={
            <ContactAvatar
              contact={contact}
              size="sm"
              className="size-4 [&_[data-slot=avatar-fallback]]:text-[8px]"
            />
          }
          className={pillClass('contact')}
        />
      ) : null}
    </>
  )
}

function Pill({
  to,
  params,
  label,
  avatar,
  className,
}: {
  to: string
  params: Record<string, string>
  label: string
  avatar: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="secondary"
      className={cn('min-w-0 gap-1.5 px-1.5 font-normal', className)}
      render={<Link to={to} params={params} aria-label={label} />}
      title={label}
    >
      {avatar}
      <span className="truncate">{label}</span>
    </Badge>
  )
}
