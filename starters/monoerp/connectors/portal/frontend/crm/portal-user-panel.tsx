import { Link } from '@tanstack/react-router'
import { Database } from 'lucide-react'
import { useState } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { appCopy } from '@/lib/app.copy'
import { isMissingFromWorkspace } from '@/lib/errors'
import { enumLabel, formatDate, labelize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TicketMeta, priorityClass } from './portal-panel'
import { Empty, Metric, Unlinked } from '@/components/source-panel'
import { PortalTicketDrawer } from './portal-ticket-drawer'
import { portalCopy } from './portal.copy'
import type { PortalUser } from './data'
import { currentSubscription, eventLabel, renewalContext } from './portal'

const copy = portalCopy.organizations.portal

const contactCopy = portalCopy.contacts.portal

const RECENT_EVENT_COUNT = 8

// The contact's own slice of the customer portal: their login, the account it belongs to,
// the tickets they opened, and what they did. Same source and same rules as the
// organization's panel: read-only, loaded apart from the CRM record.
export function PortalUserPanel({
  connected,
  user,
  pending,
  error,
  onRetry,
}: {
  connected: boolean
  user: PortalUser | null | undefined
  pending: boolean
  error: Error | null
  onRetry: () => void
}) {
  if (!connected) {
    return (
      <Unlinked title={portalCopy.contacts.notPortalUser}>{contactCopy.notPortalUser}</Unlinked>
    )
  }

  if (pending) return <DataLoading rows={4} />

  if (isMissingFromWorkspace(error)) {
    const portal = portalCopy.organizations.portal

    return <Unlinked title={portal.notSetUp}>{portal.addSource}</Unlinked>
  }

  if (error || !user) {
    return (
      <div className="space-y-3">
        <DataError error={error ?? new Error(portalCopy.contacts.notPortalUser)} />
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {appCopy.auth.tryAgain}
        </Button>
      </div>
    )
  }

  return <ConnectedUser user={user} />
}

function ConnectedUser({ user }: { user: PortalUser }) {
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const account = user.account
  const subscription = currentSubscription(account)
  const renewal = renewalContext(subscription)
  const tickets = user.tickets?.data ?? []
  const openTicket = tickets.find((ticket) => ticket.id === ticketId) ?? null
  const events = user.events?.data ?? []
  const visibleEvents = showAllEvents ? events : events.slice(0, RECENT_EVENT_COUNT)
  const openTickets = tickets.filter((ticket) => ticket.status === 'open').length
  const organizationId = account?.organization?.id

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-4 text-sm">
        <span className="inline-flex max-w-full min-w-0 items-center gap-2 font-medium">
          <Database className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{user.name}</span>
        </span>
        <Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>
          {enumLabel(copy.userStatuses, user.status)}
        </Badge>
        <span className="max-w-full min-w-0 truncate text-muted-foreground">{user.email}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {copy.title} · {copy.readOnly} · {contactCopy.member(formatDate(user.createdAt))}
        </span>
      </div>

      <dl className="grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
        <Metric label={copy.role} value={labelize(user.role)} />
        <Metric
          label={copy.lastLogin}
          value={
            user.lastLoginAt ? (
              <RelativeTime value={user.lastLoginAt} className="cursor-default" />
            ) : (
              copy.neverLoggedIn
            )
          }
          hint={user.lastLoginAt ? formatDate(user.lastLoginAt) : undefined}
        />
        <Metric
          label={contactCopy.account}
          value={
            organizationId ? (
              <Link
                to="/crm/organizations/$organizationId"
                params={{ organizationId }}
                className="hover:underline"
              >
                {account?.name}
              </Link>
            ) : (
              (account?.name ?? contactCopy.noAccount)
            )
          }
          hint={
            subscription?.plan?.name
              ? [subscription.plan.name, renewal?.label].filter(Boolean).join(' · ')
              : undefined
          }
          tone={renewal?.tone ?? 'normal'}
        />
        <Metric
          label={copy.openTickets}
          value={String(openTickets)}
          tone={openTickets >= 3 ? 'warn' : 'normal'}
        />
      </dl>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.tickets}
        </h2>
        {tickets.length ? (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.ticket}</TableHead>
                  <TableHead className="max-sm:hidden">{copy.ticketStatuses.open}</TableHead>
                  <TableHead className="max-sm:hidden">{copy.priority}</TableHead>
                  <TableHead className="max-sm:hidden">{copy.opened}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className="cursor-pointer"
                    onClick={() => setTicketId(ticket.id ?? null)}
                  >
                    <TableCell className="font-medium max-sm:whitespace-normal">
                      {ticket.subject}
                      <TicketMeta ticket={ticket} />
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      <Badge variant={ticket.status === 'open' ? 'default' : 'outline'}>
                        {enumLabel(copy.ticketStatuses, ticket.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn('max-sm:hidden', priorityClass(ticket.priority))}>
                      {labelize(ticket.priority)}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">
                      <RelativeTime value={ticket.openedAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>{contactCopy.noTickets}</Empty>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.activity}
        </h2>
        {events.length ? (
          <>
            <ul className="divide-y border-y">
              {visibleEvents.map((event) => (
                <li
                  key={event.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 text-sm"
                >
                  <p className="min-w-0 truncate">
                    <span className="font-medium">{eventLabel(event.type)}</span>
                    {event.detail ? (
                      <span className="text-muted-foreground"> · {event.detail}</span>
                    ) : null}
                  </p>
                  <RelativeTime
                    value={event.occurredAt}
                    className="text-xs text-muted-foreground tabular-nums"
                  />
                </li>
              ))}
            </ul>
            {events.length > RECENT_EVENT_COUNT ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAllEvents((visible) => !visible)}
              >
                {showAllEvents ? copy.showFewer : copy.showAll(events.length)}
              </Button>
            ) : null}
          </>
        ) : (
          <Empty>{contactCopy.noEvents}</Empty>
        )}
      </section>

      <PortalTicketDrawer
        ticket={openTicket}
        account={account ? { name: account.name, organizationId } : null}
        onOpenChange={(open) => !open && setTicketId(null)}
      />
    </div>
  )
}
