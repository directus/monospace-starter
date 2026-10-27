import { Link } from '@tanstack/react-router'
import { Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'

import { DrawerFormBody, FormDrawer } from '@/components/form/form-drawer'
import { Property, PropertyList } from '@/components/inline/inline-field'
import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/assets'
import { formatDateTime } from '@/lib/format'
import { activityIcons } from '@/modules/crm/components/activity-form'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { AttachmentRow } from '@/modules/crm/data'
import { contactName } from '@/modules/crm/entities'
import { ContactIcon, DealIcon, OrganizationIcon } from '@/modules/crm/icons'

import { FileActions } from './actions'
import { kindOf } from './file-kind'
import { FilePreview } from './preview'
import type { Hide } from './types'

const copy = crmCopy.files

export function FileDrawer({
  row,
  hide,
  open,
  onOpenChange,
  onExpand,
  onDelete,
}: {
  row: AttachmentRow
  hide: Hide
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpand: () => void
  onDelete?: () => void
}) {
  const name = row.fileName ?? ''
  const kind = kindOf(row)
  const uploader = row.createdBy?.fullName ?? row.createdBy?.email

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={name}
      description={
        kind === 'link'
          ? (row.url ?? undefined)
          : [row.contentType, formatBytes(row.sizeBytes)].filter(Boolean).join(' · ')
      }
      actions={<RecordMenu size="icon-sm" variant="ghost" onDelete={onDelete} />}
    >
      <DrawerFormBody>
        <div className="group/preview relative overflow-hidden rounded-lg border bg-muted/30">
          <FilePreview row={row} />
          <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 transition-opacity group-focus-within/preview:opacity-100 group-hover/preview:opacity-100 [@media(hover:hover)]:opacity-0">
            <FileActions row={row} onExpand={onExpand} />
          </div>
        </div>
        <PropertyList className="grid grid-cols-2 gap-4 space-y-0">
          {kind === 'link' ? (
            <Property label={copy.linkUrl}>
              <a
                href={row.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="break-all hover:underline"
              >
                {row.url}
              </a>
            </Property>
          ) : (
            <>
              <Property label={copy.type}>{row.contentType ?? '—'}</Property>
              <Property label={copy.size}>{formatBytes(row.sizeBytes) || '—'}</Property>
            </>
          )}
          <Property label={copy.uploadedBy}>{uploader ?? '—'}</Property>
          <Property label={copy.uploadedAt}>{formatDateTime(row.createdAt)}</Property>
        </PropertyList>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {copy.linked}
          </h3>
          <div className="space-y-1 text-sm [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_a]:py-1 [&_a]:hover:underline [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
            {row.interactions?.id && !hide.includes('activity') ? (
              <div className="flex items-center gap-2.5 py-1">
                <ActivityTypeIcon type={row.interactions.type} />
                <span className="truncate">
                  {row.interactions.subject ?? crmCopy.activity.untitled}
                </span>
              </div>
            ) : null}
            {row.opportunities?.id && !hide.includes('deal') ? (
              <Link to="/crm/deals/$dealId" params={{ dealId: row.opportunities.id }}>
                <DealIcon />
                <span className="truncate">
                  {row.opportunities.title ?? crmCopy.deals.restricted}
                </span>
              </Link>
            ) : null}
            {row.contacts?.id && !hide.includes('contact') ? (
              <Link to="/crm/contacts/$contactId" params={{ contactId: row.contacts.id }}>
                <ContactIcon />
                <span className="truncate">{contactName(row.contacts) ?? ''}</span>
              </Link>
            ) : null}
            {row.organizations?.id && !hide.includes('organization') ? (
              <Link
                to="/crm/organizations/$organizationId"
                params={{ organizationId: row.organizations.id }}
              >
                <OrganizationIcon />
                <span className="truncate">
                  {row.organizations.name ?? crmCopy.organizations.restricted}
                </span>
              </Link>
            ) : null}
          </div>
        </section>
      </DrawerFormBody>
    </FormDrawer>
  )
}

function ActivityTypeIcon({ type }: { type: string | null | undefined }) {
  const Icon = activityIcons[type ?? 'note'] ?? Paperclip

  return <Icon />
}

// Where the file sits below the organization: the activity it was attached to, else the deal,
// else the contact. Skips whatever the page already is.
export function ContextPill({ row, hide }: { row: AttachmentRow; hide: Hide }) {
  let content: ReactNode = null

  if (row.interactions?.id && !hide.includes('activity')) {
    content = (
      <>
        <ActivityTypeIcon type={row.interactions.type} />
        <span className="truncate">{row.interactions.subject ?? crmCopy.activity.untitled}</span>
      </>
    )
  } else if (row.opportunities?.id && !hide.includes('deal')) {
    content = (
      <>
        <DealIcon />
        <span className="truncate">{row.opportunities.title ?? crmCopy.deals.restricted}</span>
      </>
    )
  } else if (row.contacts?.id && !hide.includes('contact')) {
    content = (
      <>
        <ContactIcon />
        <span className="truncate">{contactName(row.contacts) ?? ''}</span>
      </>
    )
  }

  if (!content) return null

  return (
    <Badge
      variant="secondary"
      className="max-w-44 min-w-0 gap-1 bg-white/90 px-1.5 font-normal text-neutral-900 shadow-sm backdrop-blur-sm [&_svg]:size-3"
    >
      {content}
    </Badge>
  )
}
