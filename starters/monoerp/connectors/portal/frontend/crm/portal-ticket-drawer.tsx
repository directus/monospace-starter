import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DrawerFormBody, FormDrawer } from '@/components/form/form-drawer'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { labelize, parseDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { enumLabel } from '@/lib/format'
import { portalCopy } from './portal.copy'
import { ContactRound as ContactIcon, Building2 as OrganizationIcon } from 'lucide-react'
import { durationLabel } from './portal'
import type { Uuid } from '@/generated/monospace'

const copy = portalCopy.organizations.portal

const DAY_MS = 86_400_000

// Structural so the organization and contact panels can each pass their own ticket shape.
export type PortalTicket = {
  id?: string | null
  subject?: string | null
  body?: string | null
  status?: string | null
  priority?: string | null
  openedAt?: string | null
  resolvedAt?: string | null
}

export type TicketPerson = {
  name?: string | null
  email?: string | null
  contactId?: Uuid | null
}

export type TicketAccount = { name?: string | null; organizationId?: Uuid | null }

// Everything the portal knows about one ticket. There is no body or thread in the portal
// schema, so this is the header facts, who raised it, and where. Read-only.
export function PortalTicketDrawer({
  ticket,
  openedBy,
  account,
  onOpenChange,
}: {
  ticket: PortalTicket | null
  // Omit either when the reader is already on that person's or organization's page.
  openedBy?: TicketPerson | null
  account?: TicketAccount | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <FormDrawer
      open={Boolean(ticket)}
      onOpenChange={onOpenChange}
      title={ticket?.subject ?? copy.ticket}
      description={`${copy.title} · ${copy.readOnly}`}
    >
      {ticket ? <TicketView ticket={ticket} openedBy={openedBy} account={account} /> : null}
    </FormDrawer>
  )
}

function TicketView({
  ticket,
  openedBy,
  account,
}: {
  ticket: PortalTicket
  openedBy?: TicketPerson | null
  account?: TicketAccount | null
}) {
  const [now] = useState(() => Date.now())
  const opened = ticket.openedAt ? parseDate(ticket.openedAt).getTime() : null
  const closed = ticket.resolvedAt ? parseDate(ticket.resolvedAt).getTime() : now
  const age = opened ? durationLabel(Math.max(0, Math.round((closed - opened) / DAY_MS))) : null

  return (
    <DrawerFormBody>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={ticket.status === 'open' ? 'default' : 'outline'}>
          {enumLabel(copy.ticketStatuses, ticket.status)}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            ticket.priority === 'urgent' && 'border-destructive/40 text-destructive',
            ticket.priority === 'high' && 'font-medium',
          )}
        >
          {copy.priority} · {labelize(ticket.priority)}
        </Badge>
        {age ? (
          <span className="text-xs text-muted-foreground">
            {ticket.resolvedAt ? copy.resolvedIn(age) : copy.openFor(age)}
          </span>
        ) : null}
      </div>

      {ticket.body ? (
        <p className="text-sm wrap-anywhere whitespace-pre-wrap">{ticket.body}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noBody}</p>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{copy.opened}</dt>
        <dd className="tabular-nums">
          <RelativeTime value={ticket.openedAt} />
        </dd>
        <dt className="text-muted-foreground">{copy.ticketStatuses.resolved}</dt>
        <dd className="tabular-nums">
          {ticket.resolvedAt ? (
            <RelativeTime value={ticket.resolvedAt} />
          ) : (
            <span className="text-muted-foreground">{copy.notResolved}</span>
          )}
        </dd>
      </dl>

      {openedBy || account ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {openedBy ? copy.openedBy : portalCopy.contacts.portal.account}
          </h3>
          <div className="divide-y rounded-lg border">
            {openedBy ? (
              <LinkedRow
                icon={<ContactIcon />}
                link={
                  openedBy.contactId
                    ? { to: '/crm/contacts/$contactId', params: { contactId: openedBy.contactId } }
                    : undefined
                }
                primary={openedBy.name ?? openedBy.email ?? ''}
                secondary={openedBy.contactId ? openedBy.email : copy.notInCrm}
              />
            ) : null}
            {account ? (
              <LinkedRow
                icon={<OrganizationIcon />}
                link={
                  account.organizationId
                    ? {
                        to: '/crm/organizations/$organizationId',
                        params: { organizationId: account.organizationId },
                      }
                    : undefined
                }
                primary={account.name ?? ''}
                secondary={copy.title}
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </DrawerFormBody>
  )
}

type RecordLink =
  | { to: '/crm/contacts/$contactId'; params: { contactId: Uuid } }
  | { to: '/crm/organizations/$organizationId'; params: { organizationId: Uuid } }

function LinkedRow({
  icon,
  link,
  primary,
  secondary,
}: {
  icon: ReactNode
  link?: RecordLink
  primary: string
  secondary?: string | null
}) {
  const body = (
    <>
      <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{primary}</span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
    </>
  )

  const className = 'flex items-center gap-3 px-3 py-2 text-sm'

  if (!link) return <div className={className}>{body}</div>

  return link.to === '/crm/contacts/$contactId' ? (
    <Link to={link.to} params={link.params} className={cn(className, 'hover:bg-muted/50')}>
      {body}
    </Link>
  ) : (
    <Link to={link.to} params={link.params} className={cn(className, 'hover:bg-muted/50')}>
      {body}
    </Link>
  )
}
