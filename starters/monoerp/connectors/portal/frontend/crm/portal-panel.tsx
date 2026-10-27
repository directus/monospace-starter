import { Link } from '@tanstack/react-router'
import { Database, UserPlus } from 'lucide-react'
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
import { enumLabel, formatDate, formatMoney, formatRelative, labelize } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Empty, Metric, Unlinked } from '@/components/panel'
import { portalCopy } from './portal.copy'
import { PortalTicketDrawer } from './portal-ticket-drawer'
import type { PortalAccount } from './data'
import {
  accountStatusLabel,
  currentSubscription,
  eventLabel,
  openTicketCount,
  renewalContext,
  seatUsage,
} from './portal'

const copy = portalCopy.organizations.portal

const RECENT_EVENT_COUNT = 8

const RECENT_USER_COUNT = 10

// Everything the customer portal knows about this organization, read through Monospace from
// the portal's own MySQL. Nothing here is editable; the CRM never writes to that database.
// Loads separately from the organization, so a portal outage is one retryable error here
// and the rest of the page stays up.
export type PortalUserRow = NonNullable<PortalAccount['users']>['data'][number]

export function PortalPanel({
  connected,
  account,
  pending,
  error,
  onRetry,
  onAddContact,
}: {
  connected: boolean
  account: PortalAccount | null | undefined
  pending: boolean
  error: Error | null
  onRetry: () => void
  onAddContact?: (user: PortalUserRow) => void
}) {
  if (!connected)
    return <Unlinked title={portalCopy.organizations.notConnected}>{copy.connect}</Unlinked>

  if (pending) return <DataLoading rows={4} />

  if (isMissingFromWorkspace(error))
    return <Unlinked title={copy.notSetUp}>{copy.addSource}</Unlinked>

  if (error || !account) {
    return (
      <div className="space-y-3">
        <DataError error={error ?? new Error(portalCopy.organizations.notConnected)} />
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {appCopy.auth.tryAgain}
        </Button>
      </div>
    )
  }

  return <ConnectedAccount account={account} onAddContact={onAddContact} />
}

// People we already know first, then whoever runs the account, then whoever was here last.
const ROLE_RANK = new Map([
  ['owner', 0],
  ['admin', 1],
])

function userRank(user: PortalUserRow) {
  return [user.contacts?.id ? 0 : 1, ROLE_RANK.get(user.role ?? '') ?? 2] as const
}

function byRelevance(a: PortalUserRow, b: PortalUserRow) {
  const [aKnown, aRole] = userRank(a)
  const [bKnown, bRole] = userRank(b)

  return (
    aKnown - bKnown ||
    aRole - bRole ||
    (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? '') ||
    (a.name ?? '').localeCompare(b.name ?? '')
  )
}

function ConnectedAccount({
  account,
  onAddContact,
}: {
  account: PortalAccount
  onAddContact?: (user: PortalUserRow) => void
}) {
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const subscription = currentSubscription(account)
  const seats = seatUsage(account)
  const renewal = renewalContext(subscription)
  const users = [...(account.users?.data ?? [])].sort(byRelevance)
  const visibleUsers = showAllUsers ? users : users.slice(0, RECENT_USER_COUNT)
  const tickets = account.tickets?.data ?? []
  const openTicket = tickets.find((ticket) => ticket.id === ticketId) ?? null
  const events = account.events?.data ?? []
  const visibleEvents = showAllEvents ? events : events.slice(0, RECENT_EVENT_COUNT)

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-4 text-sm">
        <span className="inline-flex max-w-full min-w-0 items-center gap-2 font-medium">
          <Database className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{account.name}</span>
        </span>
        <Badge variant={account.status === 'active' ? 'secondary' : 'outline'}>
          {accountStatusLabel(account.status)}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {copy.title} · {copy.readOnly} · {copy.synced(formatRelative(account.updatedAt, now))}
        </span>
      </div>

      <dl className="grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
        <Metric
          label={copy.plan}
          value={subscription?.plan?.name ?? copy.noPlan}
          hint={
            subscription?.plan?.monthlyPrice
              ? `${formatMoney(subscription.plan.monthlyPrice)}/mo · ${subscriptionStatusLabel(subscription.status)}`
              : subscriptionStatusLabel(subscription?.status)
          }
        />
        <Metric
          label={copy.seats}
          value={seats ? copy.seatUsage(seats.used, seats.total) : String(users.length)}
          hint={seats?.full ? copy.seatsFull : undefined}
          tone={seats?.full ? 'warn' : 'normal'}
        />
        <Metric
          label={copy.renews}
          value={
            subscription?.renewsAt ? formatDate(subscription.renewsAt) : (renewal?.label ?? '')
          }
          hint={subscription?.renewsAt ? renewal?.label : undefined}
          tone={renewal?.tone ?? 'normal'}
        />
        <Metric
          label={copy.openTickets}
          value={String(openTicketCount(account))}
          tone={openTicketCount(account) >= 3 ? 'warn' : 'normal'}
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
                  <TableHead className="max-sm:hidden">
                    {portalCopy.organizations.portal.ticketStatuses.open}
                  </TableHead>
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
                    <TableCell className="max-sm:whitespace-normal">
                      <p className="font-medium">{ticket.subject}</p>
                      {ticket.user?.name ? (
                        <p className="text-xs text-muted-foreground">
                          {copy.openedBy} {ticket.user.name}
                        </p>
                      ) : null}
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
          <Empty>{portalCopy.organizations.noTickets}</Empty>
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
                  <div className="min-w-0">
                    <p className="truncate">
                      <span className="font-medium">{eventLabel(event.type)}</span>
                      {event.detail ? (
                        <span className="text-muted-foreground"> · {event.detail}</span>
                      ) : null}
                    </p>
                    {event.user?.name ? (
                      <p className="text-xs text-muted-foreground">{event.user.name}</p>
                    ) : null}
                  </div>
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
          <Empty>{portalCopy.organizations.noPortalEvents}</Empty>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.users}
        </h2>
        {users.length ? (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.user}</TableHead>
                  <TableHead>{copy.role}</TableHead>
                  <TableHead>{portalCopy.organizations.portal.userStatuses.active}</TableHead>
                  <TableHead>{copy.lastLogin}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((user) => {
                  const contactId = user.contacts?.id

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="flex items-center gap-2 font-medium">
                          {user.name}
                          {contactId ? (
                            <Link
                              to="/crm/contacts/$contactId"
                              params={{ contactId }}
                              className="text-xs font-normal text-muted-foreground hover:underline"
                            >
                              {copy.inCrm}
                            </Link>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="font-normal text-muted-foreground"
                              onClick={() => onAddContact?.(user)}
                            >
                              <UserPlus data-icon="inline-start" />
                              {copy.addContact}
                            </Button>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </TableCell>
                      <TableCell>{labelize(user.role)}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'secondary' : 'outline'}>
                          {enumLabel(copy.userStatuses, user.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.lastLoginAt ? (
                          <RelativeTime value={user.lastLoginAt} />
                        ) : (
                          copy.neverLoggedIn
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {users.length > RECENT_USER_COUNT ? (
              <div className="border-t px-2 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllUsers((visible) => !visible)}
                >
                  {showAllUsers ? copy.showFewer : copy.showAll(users.length)}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty>{portalCopy.organizations.noPortalUsers}</Empty>
        )}
      </section>
      <PortalTicketDrawer
        ticket={openTicket}
        openedBy={
          openTicket?.user
            ? {
                name: openTicket.user.name,
                email: openTicket.user.email,
                contactId: openTicket.user.contacts?.id,
              }
            : null
        }
        onOpenChange={(open) => !open && setTicketId(null)}
      />
    </div>
  )
}

export function priorityClass(priority: string | null | undefined) {
  return cn(
    priority === 'urgent' && 'font-medium text-destructive',
    priority === 'high' && 'font-medium',
  )
}

// Below sm the ticket table drops its status, priority and opened columns; this line under the
// subject carries them instead.
export function TicketMeta({
  ticket,
}: {
  ticket: {
    status?: string | null
    priority?: string | null
    openedAt?: string | null
  }
}) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground sm:hidden">
      <Badge variant={ticket.status === 'open' ? 'default' : 'outline'}>
        {enumLabel(copy.ticketStatuses, ticket.status)}
      </Badge>
      {ticket.priority ? (
        <span className={priorityClass(ticket.priority)}>{labelize(ticket.priority)}</span>
      ) : null}
      <RelativeTime value={ticket.openedAt} />
    </p>
  )
}

function subscriptionStatusLabel(status: string | null | undefined) {
  return enumLabel(copy.subscriptionStatuses, status)
}
