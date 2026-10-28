import {
  CalendarClock,
  MailCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { todayInput } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { isPastRetention } from '@/modules/ats/components/candidates/candidate-labels'
import { useSendPrivacyNotice, useUpdateCandidate } from '@/modules/ats/mutations/candidates'

const copy = atsCopy.candidates.privacy

// Twelve months from a date (yyyy-mm-dd), as a date.
function plusYear(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return `${(year ?? 0) + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type PrivacyCandidate = {
  id: Uuid
  firstName: string | null
  lastName: string | null
  email: string | null
  consentAt: string | null
  privacyNoticeSentAt: string | null
  retainUntil: string | null
}

export function PrivacyPanel({
  candidate,
  onDeleteAll,
}: {
  candidate: PrivacyCandidate
  onDeleteAll: () => void
}) {
  const update = useUpdateCandidate({ notify: false })
  const notice = useSendPrivacyNotice()
  const past = isPastRetention(candidate.retainUntil)

  return (
    <div className="space-y-6">
      <ul className="divide-y rounded-xl border">
        <Row
          icon={candidate.consentAt ? ShieldCheck : ShieldQuestion}
          tone={candidate.consentAt ? 'good' : 'warn'}
          title={copy.consent}
          detail={
            candidate.consentAt
              ? copy.consentGiven(formatDateTime(candidate.consentAt))
              : copy.awaitingHint
          }
          action={
            candidate.consentAt ? null : (
              <Button
                variant="outline"
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    {
                      id: candidate.id,
                      data: {
                        consentAt: new Date().toISOString(),
                        retainUntil: plusYear(todayInput()),
                      },
                    },
                    { onSuccess: () => toast.success(copy.consentRecorded) },
                  )
                }
              >
                {copy.recordConsent}
              </Button>
            )
          }
        />
        <Row
          icon={MailCheck}
          tone={candidate.privacyNoticeSentAt ? 'good' : 'warn'}
          title={copy.notice}
          detail={
            candidate.privacyNoticeSentAt
              ? copy.noticeSent(formatDateTime(candidate.privacyNoticeSentAt))
              : copy.noticeNotSent
          }
          action={
            <Button
              variant="ghost"
              size="sm"
              disabled={notice.isPending}
              onClick={() =>
                notice.mutate({
                  id: candidate.id,
                  firstName: candidate.firstName ?? '',
                  lastName: candidate.lastName ?? '',
                  email: candidate.email ?? '',
                })
              }
            >
              {candidate.privacyNoticeSentAt ? copy.resendNotice : copy.sendNotice}
            </Button>
          }
        />
        <Row
          icon={past ? ShieldAlert : CalendarClock}
          tone={past ? 'bad' : candidate.retainUntil ? 'neutral' : 'warn'}
          title={copy.retention}
          detail={
            !candidate.retainUntil
              ? copy.retentionNotSet
              : past
                ? copy.retentionPast(formatDate(candidate.retainUntil))
                : copy.retentionLeft(formatDate(candidate.retainUntil))
          }
          action={
            candidate.retainUntil ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={update.isPending}
                onClick={() => {
                  const today = todayInput()

                  const from =
                    candidate.retainUntil && candidate.retainUntil > today
                      ? candidate.retainUntil
                      : today

                  update.mutate(
                    { id: candidate.id, data: { retainUntil: plusYear(from) } },
                    { onSuccess: () => toast.success(copy.extended) },
                  )
                }}
              >
                {copy.extend}
              </Button>
            ) : null
          }
        />
      </ul>

      <section className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-destructive">{copy.deleteTitle}</h3>
          <p className="text-sm text-muted-foreground">{copy.deleteHint}</p>
        </div>
        <Button variant="destructive" size="sm" onClick={onDeleteAll}>
          <Trash2 data-icon="inline-start" />
          {copy.deleteConfirm}
        </Button>
      </section>
    </div>
  )
}

const tones = {
  good: 'bg-success/10 text-success',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

function Row({
  icon: Icon,
  tone,
  title,
  detail,
  action,
}: {
  icon: typeof ShieldCheck
  tone: keyof typeof tones
  title: string
  detail: string
  action?: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 max-sm:flex-wrap">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className={cn('text-sm text-muted-foreground', tone === 'bad' && 'text-destructive')}>
          {detail}
        </p>
      </div>
      {action}
    </li>
  )
}

// Deleting everything about a person is the one action that can't be undone, so it asks for
// the candidate's email typed out, not just a click.
export function DeleteCandidateDialog({
  open,
  onOpenChange,
  name,
  phrase,
  pending,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  phrase: string
  pending: boolean
  error?: unknown
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === phrase.toLowerCase()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)

        if (!next) setTyped('')
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{copy.deleteConfirmTitle(name)}</DialogTitle>
          <DialogDescription>{copy.deleteConfirmDescription}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()

            if (matches) onConfirm()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="delete-candidate-confirm">{copy.deleteTypeToConfirm(phrase)}</Label>
            <Input
              id="delete-candidate-confirm"
              value={typed}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error, appCopy.form.deleteFailed)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {appCopy.common.cancel}
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || pending}>
              {pending ? copy.deleting : copy.deleteConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
