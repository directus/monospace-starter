import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Clock, MailPlus, MailWarning } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DataError, DataLoading } from '@/components/data-state'
import { FormDrawer } from '@/components/form/form-drawer'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { atNine, fromDateTimeInput, toDateTimeInput } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  candidateTemplateValues,
  fillTemplate,
} from '@/modules/ats/components/candidates/email-template'
import { candidateMessagesQuery, emailTemplatesQuery } from '@/modules/ats/data/candidates'
import type { CandidateMessage } from '@/modules/ats/data/candidates'
import { useSendCandidateMessage } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.emails

type Recipient = {
  id: Uuid
  firstName: string | null
  lastName: string | null
  email: string | null
}

export function EmailsPanel({
  candidate,
  jobTitle,
}: {
  candidate: Recipient
  // The job a template's {{job_title}} refers to: the candidate's most recent active one.
  jobTitle?: string | null
}) {
  const messages = useQuery(candidateMessagesQuery(candidate.id))
  const [composing, setComposing] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        <MailWarning className="size-4 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1">{copy.notConnected}</span>
        <Button size="sm" onClick={() => setComposing(true)}>
          <MailPlus data-icon="inline-start" />
          {copy.compose}
        </Button>
      </div>

      {messages.isPending ? <DataLoading rows={3} /> : null}
      {messages.isError ? <DataError error={messages.error} /> : null}
      {messages.data?.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{copy.empty}</p>
      ) : null}
      {messages.data?.length ? (
        <ol className="relative space-y-3 before:absolute before:inset-y-3 before:left-4 before:w-px before:bg-border">
          {messages.data.map((message) => (
            <MessageItem key={message.id} message={message} candidate={candidate} />
          ))}
        </ol>
      ) : null}

      <ComposeDrawer
        open={composing}
        onOpenChange={setComposing}
        candidate={candidate}
        jobTitle={jobTitle}
      />
    </div>
  )
}

function MessageItem({ message, candidate }: { message: CandidateMessage; candidate: Recipient }) {
  const [open, setOpen] = useState(false)
  const [now] = useState(() => Date.now())
  const inbound = message.direction === 'inbound'

  // Sending is stubbed, so a scheduled email whose time has passed reads as sent.
  const scheduled = message.status === 'scheduled' && new Date(message.sendAt ?? 0).getTime() > now

  const Icon = scheduled ? Clock : inbound ? ArrowDownLeft : ArrowUpRight

  const from = inbound
    ? `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim()
    : message.createdBy
      ? userName(message.createdBy)
      : atsCopy.module.label

  return (
    <li className="relative flex gap-3">
      <span
        className={cn(
          'z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-background',
          inbound && 'border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
          scheduled && 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'min-w-0 flex-1 rounded-xl border bg-card px-4 py-3 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
          scheduled && 'border-dashed',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{message.subject}</span>
          {scheduled ? (
            <Badge
              variant="secondary"
              className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              {copy.scheduledFor(formatDateTime(message.sendAt))}
            </Badge>
          ) : message.status === 'failed' ? (
            <Badge variant="destructive">{copy.status.failed}</Badge>
          ) : null}
          <RelativeTime value={message.sendAt} className="ml-auto text-xs text-muted-foreground" />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {inbound ? copy.inbound : copy.outbound} · {from}
        </p>
        <p
          className={cn(
            'mt-2 text-sm whitespace-pre-wrap text-muted-foreground',
            !open && 'line-clamp-2',
          )}
        >
          {open ? message.body : message.body?.replace(/\s+/g, ' ')}
        </p>
      </button>
    </li>
  )
}

const SCRATCH = 'scratch'

function ComposeDrawer({
  open,
  onOpenChange,
  candidate,
  jobTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidate: Recipient
  jobTitle?: string | null
}) {
  const templates = useQuery({ ...emailTemplatesQuery(), enabled: open })
  const user = useCurrentUser()
  const send = useSendCandidateMessage()
  const [templateId, setTemplateId] = useState(SCRATCH)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [later, setLater] = useState(false)
  const [sendAt, setSendAt] = useState(() => toDateTimeInput(atNine(2)))
  const [error, setError] = useState<string>()
  const name = `${candidate.firstName ?? ''} ${candidate.lastName ?? ''}`.trim()

  const values = candidateTemplateValues({
    candidate,
    jobTitle,
    senderName: user?.fullName ?? user?.email,
  })

  const options = [
    { value: SCRATCH, label: copy.noTemplate },
    ...(templates.data ?? []).map((template) => ({
      value: template.id,
      label: template.name ?? '',
    })),
  ]

  function pick(id: string) {
    setTemplateId(id)
    const template = templates.data?.find((row) => row.id === id)

    if (!template) return
    setSubject(fillTemplate(template.subject ?? '', values))
    setBody(fillTemplate(template.body ?? '', values))
  }

  function close(next: boolean) {
    if (send.isPending) return
    onOpenChange(next)

    if (!next) {
      setTemplateId(SCRATCH)
      setSubject('')
      setBody('')
      setLater(false)
      setSendAt(toDateTimeInput(atNine(2)))
      setError(undefined)
    }
  }

  async function submit() {
    setError(undefined)

    if (!subject.trim()) {
      setError(appCopy.form.required(copy.subject))

      return
    }

    const at = later ? fromDateTimeInput(sendAt) : null

    if (later && (!at || new Date(at).getTime() <= Date.now())) {
      setError(copy.pastSchedule)

      return
    }

    try {
      await send.mutateAsync({
        candidateId: candidate.id,
        subject: subject.trim(),
        body,
        sendAt: at ?? undefined,
      })
      toast.success(at ? copy.scheduled(formatDateTime(at)) : copy.sent)
      close(false)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <FormDrawer open={open} onOpenChange={close} title={copy.composeTitle(name)} size="lg">
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <MailWarning className="mt-px size-3.5 shrink-0" />
            {copy.notConnected}
          </p>
          <div className="space-y-2">
            <Label htmlFor="email-template">{copy.template}</Label>
            <Select
              items={options}
              value={templateId}
              onValueChange={(value) => pick(value ?? SCRATCH)}
            >
              <SelectTrigger id="email-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{copy.placeholders}</p>
          </div>
          <div className="space-y-2">
            <Label>{copy.to}</Label>
            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
              <UserAvatar user={{ fullName: name }} size="sm" />
              <span className="truncate">
                {name} <span className="text-muted-foreground">&lt;{candidate.email}&gt;</span>
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">{copy.subject}</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={240}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">{copy.body}</Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-56"
            />
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={later} onCheckedChange={(checked) => setLater(Boolean(checked))} />
              {copy.schedule}
            </label>
            {later ? (
              <DatePicker
                value={sendAt}
                onChange={setSendAt}
                includeTime
                aria-label={copy.sendAt}
              />
            ) : null}
          </div>
        </div>
        <footer className="shrink-0 space-y-3 border-t px-4 py-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 max-md:[&>*]:flex-1">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {appCopy.common.cancel}
            </Button>
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? copy.sending : later ? copy.scheduleSend : copy.send}
            </Button>
          </div>
        </footer>
      </form>
    </FormDrawer>
  )
}
