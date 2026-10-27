import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, Loader2, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DrawerFormBody, DrawerFormFooter, FormDrawer } from '@/components/form/form-drawer'
import { InlineReadOnly } from '@/components/inline/inline-field'
import { InlineOwner } from '@/components/inline/inline-owner'
import { RecordMenu } from '@/components/record-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { atNine, now } from '@/lib/dates'
import { formatDateTime, formatDue, formatMoney } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { contactName, isOpen, toActivityInitial } from '@/modules/crm/activity'
import { DueChip } from '@/modules/crm/components/activity-composer'
import { ActivityForm, activityIcons } from '@/modules/crm/components/activity-form'
import { AttachmentsPanel } from '@/modules/crm/components/files/panel'
import type { LinkedRecord } from '@/modules/crm/components/todo-list'
import { crmCopy } from '@/modules/crm/crm.copy'
import { recentInteractionsQuery } from '@/modules/crm/data'
import type { ActivityRecord } from '@/modules/crm/data'
import { ContactIcon, DealIcon, OrganizationIcon } from '@/modules/crm/icons'
import { useCreateActivity, useUpdateActivity } from '@/modules/crm/mutations'

const copy = crmCopy.activity

export type ActivityDetailMode = 'view' | 'edit'

// The same drawer as "Log activity", in two modes. View: what it's about, what it's linked to,
// what happened last on the account, and how it ends (complete with an outcome, snooze,
// reassign, drop). Edit: the activity form, in place.
export function ActivityDetailDrawer({
  row,
  mode,
  onModeChange,
  onOpenChange,
  onDelete,
  hide = [],
}: {
  row: ActivityRecord | null
  mode: ActivityDetailMode
  onModeChange: (mode: ActivityDetailMode) => void
  onOpenChange: (open: boolean) => void
  onDelete: (row: ActivityRecord) => void
  // Linked records the reader is already looking at; also skips "recently on this account"
  // when that record is the organization.
  hide?: ReadonlyArray<LinkedRecord>
}) {
  const access = useCollectionAccess('interactions')

  const initial =
    row && mode === 'edit' && access.canUpdate('subject') ? toActivityInitial(row) : null

  return (
    <FormDrawer
      open={Boolean(row)}
      onOpenChange={onOpenChange}
      title={initial ? appCopy.form.edit(copy.singular) : (row?.subject ?? copy.untitled)}
      description={row && !initial ? describe(row, hide) : undefined}
      actions={
        row && !initial ? (
          <RecordMenu
            size="icon-sm"
            variant="ghost"
            onEdit={access.canUpdate('subject') ? () => onModeChange('edit') : undefined}
            onDelete={access.delete ? () => onDelete(row) : undefined}
          />
        ) : undefined
      }
    >
      {row ? (
        initial ? (
          <ActivityForm
            key={`edit-${row.id}`}
            initial={initial}
            onCancel={() => onModeChange('view')}
            onSuccess={() => onModeChange('view')}
          />
        ) : (
          <DetailView key={row.id} row={row} hide={hide} onClose={() => onOpenChange(false)} />
        )
      ) : null}
    </FormDrawer>
  )
}

function describe(row: ActivityRecord, hide: ReadonlyArray<LinkedRecord>) {
  // SAFETY: interactions.type only holds the select options copy.types is keyed by; unknown values
  // fall back to the raw type. See docs/monospace.md, known issues.
  const type = copy.types[(row.type ?? 'note') as keyof typeof copy.types] ?? row.type

  return [
    type,
    hide.includes('contact') ? null : contactName(row),
    hide.includes('organization') ? null : row.organizations?.name,
  ]
    .filter(Boolean)
    .join(' · ')
}

function DetailView({
  row,
  hide,
  onClose,
}: {
  row: ActivityRecord
  hide: ReadonlyArray<LinkedRecord>
  onClose: () => void
}) {
  const access = useCollectionAccess('interactions')
  const update = useUpdateActivity()
  const [at] = useState(() => Date.now())
  const open = isOpen(row)
  const due = row.dueAt ?? row.occurredAt
  const overdue = open && Boolean(due) && new Date(due ?? 0).getTime() < at
  const person = contactName(row)
  // SAFETY: interactions.status only holds the select options copy.statuses is keyed by; see
  // docs/monospace.md, known issues.
  const status = copy.statuses[(row.status ?? 'completed') as keyof typeof copy.statuses]

  const details = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {open && access.canUpdate('dueAt') && access.canUpdate('occurredAt') ? (
          <DueChip
            value={due ?? null}
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
          <Badge variant="outline">
            {status} · {formatDateTime(row.completedAt ?? row.occurredAt)}
          </Badge>
        )}
      </div>

      {row.body ? (
        <p className="text-sm wrap-anywhere whitespace-pre-wrap">{row.body}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{copy.noDetails}</p>
      )}

      <Section title={copy.sheet.linked}>
        {row.opportunities?.id && !hide.includes('deal') ? (
          <LinkedRow
            icon={<DealIcon />}
            to="/crm/deals/$dealId"
            params={{ dealId: row.opportunities.id }}
            primary={row.opportunities.title ?? crmCopy.deals.restricted}
            secondary={[
              row.opportunities.pipeline_stages?.name,
              formatMoney(row.opportunities.valueAmount, row.opportunities.currency ?? undefined),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        {row.contacts?.id && !hide.includes('contact') ? (
          <LinkedRow
            icon={<ContactIcon />}
            to="/crm/contacts/$contactId"
            params={{ contactId: row.contacts.id }}
            primary={
              person ??
              `${crmCopy.contacts.restrictedName.first} ${crmCopy.contacts.restrictedName.last}`
            }
          />
        ) : null}
        {row.organizations?.id && !hide.includes('organization') ? (
          <LinkedRow
            icon={<OrganizationIcon />}
            to="/crm/organizations/$organizationId"
            params={{ organizationId: row.organizations.id }}
            primary={row.organizations.name ?? crmCopy.organizations.restricted}
            secondary={row.organizations.domain ?? undefined}
          />
        ) : null}
      </Section>

      {row.id && row.organizations?.id ? (
        <Section title={crmCopy.files.title}>
          <AttachmentsPanel
            variant="inline"
            scope={{ interactionId: row.id }}
            target={{
              organizationId: row.organizations.id,
              contactId: row.contacts?.id,
              opportunityId: row.opportunities?.id,
              interactionId: row.id,
            }}
            hide={['activity', 'deal', 'contact', 'organization']}
            emptyMessage={crmCopy.files.noFiles(crmCopy.activity.singular)}
          />
        </Section>
      ) : null}

      <Section title={appCopy.common.owner}>
        <InlineReadOnly value={!access.canUpdate('ownerUserId')}>
          <InlineOwner
            owner={row.owner}
            onSave={async (ownerUserId) => {
              await update.mutateAsync({ id: row.id ?? '', data: { ownerUserId } })
            }}
          />
        </InlineReadOnly>
      </Section>

      {row.organizations?.id && row.id && !hide.includes('organization') ? (
        <RecentSection organizationId={row.organizations.id} excludeId={row.id} />
      ) : null}
    </>
  )

  if (!access.canUpdate('status') || !access.canUpdate('completedAt'))
    return <DrawerFormBody>{details}</DrawerFormBody>

  return open ? (
    <CompleteForm row={row} onDone={onClose}>
      {details}
    </CompleteForm>
  ) : (
    <>
      <DrawerFormBody>{details}</DrawerFormBody>
      <DrawerFormFooter>
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { id: row.id ?? '', data: { status: 'open', completedAt: null } },
              { onSuccess: onClose },
            )
          }
        >
          <RotateCcw data-icon="inline-start" />
          {copy.sheet.reopen}
        </Button>
      </DrawerFormFooter>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function LinkedRow({
  icon,
  to,
  params,
  primary,
  secondary,
}: {
  icon: ReactNode
  to: string
  params: Record<string, string>
  primary: string
  secondary?: string
}) {
  return (
    <Link
      to={to}
      params={params}
      className="flex items-center gap-2.5 rounded-md py-1 text-sm hover:underline [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="min-w-0 truncate">
        {primary}
        {secondary ? <span className="text-muted-foreground"> · {secondary}</span> : null}
      </span>
    </Link>
  )
}

function RecentSection({ organizationId, excludeId }: { organizationId: Uuid; excludeId: Uuid }) {
  const recent = useQuery(recentInteractionsQuery(organizationId, excludeId))

  return (
    <Section title={copy.sheet.recent}>
      {recent.isPending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : recent.data?.length ? (
        recent.data.map((item) => {
          const Icon = activityIcons[item.type ?? 'note'] ?? CalendarDays

          return (
            <div key={item.id} className="flex items-center gap-2.5 py-1 text-sm">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.subject ?? copy.untitled}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDue(item.occurredAt ?? item.completedAt)}
              </span>
            </div>
          )
        })
      ) : (
        <p className="text-sm text-muted-foreground">{copy.sheet.noRecent}</p>
      )}
    </Section>
  )
}

// Complete with an optional outcome, and optionally queue the next step in the same motion.
function CompleteForm({
  row,
  onDone,
  children,
}: {
  row: ActivityRecord
  onDone: () => void
  children: ReactNode
}) {
  const access = useCollectionAccess('interactions')
  const update = useUpdateActivity()
  const create = useCreateActivity({ notify: false })
  const currentUser = useCurrentUser()
  const [outcome, setOutcome] = useState('')
  const [next, setNext] = useState<{ subject: string; due: string | null } | null>(null)
  const pending = update.isPending || create.isPending

  async function complete() {
    const note = outcome.trim()
    await update.mutateAsync({
      id: row.id ?? '',
      data: {
        status: 'completed',
        completedAt: now(),
        body: access.canUpdate('body')
          ? note
            ? row.body
              ? `${row.body}\n\n${note}`
              : note
            : row.body
          : undefined,
      },
    })

    if (next?.subject.trim() && row.organizations?.id) {
      const when = next.due ?? now()
      const ownerId = row.ownerUserId ?? currentUser?.id
      await create.mutateAsync({
        type: row.type ?? 'call',
        status: 'open',
        direction: 'internal',
        subject: next.subject.trim(),
        body: null,
        occurredAt: when,
        dueAt: next.due,
        completedAt: null,
        organizations: { _connect: { key: { id: row.organizations.id } } },
        contacts: row.contacts?.id ? { _connect: { key: { id: row.contacts.id } } } : undefined,
        opportunities: row.opportunities?.id
          ? { _connect: { key: { id: row.opportunities.id } } }
          : undefined,
        owner: ownerId ? { _connect: { key: { id: ownerId } } } : undefined,
      })
    }

    onDone()
  }

  return (
    <>
      <DrawerFormBody>
        {children}
        <div className="flex flex-col gap-3 border-t pt-5">
          <Textarea
            disabled={!access.canUpdate('body')}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder={copy.sheet.outcomePlaceholder}
            aria-label={copy.sheet.outcome}
            className="min-h-20"
          />
          {next ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={next.subject}
                placeholder={copy.sheet.nextStepPlaceholder}
                aria-label={copy.sheet.nextStep}
                onChange={(event) => setNext({ ...next, subject: event.target.value })}
                className="h-8"
              />
              <DueChip
                value={next.due}
                overdue={false}
                pending={false}
                onChange={(due) => setNext({ ...next, due })}
              />
            </div>
          ) : access.create ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => setNext({ subject: '', due: atNine(1) })}
            >
              <Plus data-icon="inline-start" />
              {copy.sheet.nextStep}
            </Button>
          ) : null}
        </div>
      </DrawerFormBody>
      <DrawerFormFooter>
        <Button className="w-full" disabled={pending} onClick={() => void complete()}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {copy.sheet.complete}
        </Button>
      </DrawerFormFooter>
    </>
  )
}
