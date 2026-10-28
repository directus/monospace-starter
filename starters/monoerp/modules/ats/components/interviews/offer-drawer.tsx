import { useQuery } from '@tanstack/react-query'
import { Check, CircleCheckBig, Clock, Pencil, Send, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { DrawerFormBody, DrawerFormFooter, FormDrawer } from '@/components/form/form-drawer'
import { RelativeTime } from '@/components/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar, userName } from '@/components/users'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { candidateName } from '@/modules/ats/components/interviews/interview-helpers'
import {
  OfferForm,
  OfferPrefilled,
  approvedRange,
  offerApprovers,
} from '@/modules/ats/components/interviews/offer-form'
import { offerQuery } from '@/modules/ats/data/interviews'
import type { OfferApproval, OfferDetail } from '@/modules/ats/data/interviews'
import {
  useAcceptOffer,
  useDecideApproval,
  useSetOfferStatus,
  useSubmitOffer,
} from '@/modules/ats/mutations/interviews'

const copy = atsCopy.interviews.offer

function statusVariant(status: string) {
  if (status === 'approved' || status === 'accepted') return 'success'

  if (status === 'declined' || status === 'rejected') return 'destructive'

  return status === 'draft' ? 'outline' : 'secondary'
}

export function OfferStatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return null

  return <Badge variant={statusVariant(status)}>{optionLabel('offerStatus', status)}</Badge>
}

// The one place an offer is created, edited, approved, sent, and accepted. Opens on the form
// when there's no offer yet, otherwise on the offer and its approval chain.
export function OfferDrawer({
  applicationId,
  open,
  onOpenChange,
}: {
  applicationId: Uuid
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detail = useQuery({ ...offerQuery(applicationId), enabled: open })
  const [editing, setEditing] = useState(false)
  const data = detail.data
  const offer = data?.offers
  const showForm = Boolean(data) && (editing || !offer?.id)

  return (
    <FormDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(false)
        onOpenChange(next)
      }}
      size="lg"
      title={copy.formTitle(candidateName(data?.candidates))}
      actions={offer?.status && !showForm ? <OfferStatusChip status={offer.status} /> : null}
    >
      {detail.isPending ? (
        <div className="p-5">
          <DataLoading rows={6} />
        </div>
      ) : detail.isError ? (
        <div className="p-5">
          <DataError error={detail.error} />
        </div>
      ) : showForm ? (
        <OfferForm
          key={offer?.id ?? 'new'}
          applicationId={applicationId}
          detail={detail.data}
          onDone={() => setEditing(false)}
          onCancel={() => (offer?.id ? setEditing(false) : onOpenChange(false))}
        />
      ) : (
        <OfferView
          applicationId={applicationId}
          detail={detail.data}
          onEdit={() => setEditing(true)}
          onClose={() => onOpenChange(false)}
        />
      )}
    </FormDrawer>
  )
}

function OfferView({
  applicationId,
  detail,
  onEdit,
  onClose,
}: {
  applicationId: Uuid
  detail: OfferDetail
  onEdit: () => void
  onClose: () => void
}) {
  const offer = detail.offers
  const submit = useSubmitOffer()
  const setStatus = useSetOfferStatus()
  const accept = useAcceptOffer()
  const range = approvedRange(detail)

  if (!offer?.id) return null

  const offerId = offer.id
  const status = offer.status ?? 'draft'

  const hiredStage = detail.requisitions?.interview_stages?.data.find(
    (stage) => stage.kind === 'hired',
  )

  const busy = submit.isPending || setStatus.isPending || accept.isPending
  const error = submit.error ?? setStatus.error ?? accept.error

  const amount = Number(offer.baseSalary)

  const outside =
    amount > 0 &&
    ((range.min != null && amount < Number(range.min)) ||
      (range.max != null && amount > Number(range.max)))

  return (
    <>
      <DrawerFormBody className="space-y-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
          <Fact label={copy.baseSalary}>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(offer.baseSalary, offer.currency ?? 'USD')}
            </span>
            {outside ? (
              <span className="block text-xs text-amber-700 dark:text-amber-300">
                {copy.outsideRange}
              </span>
            ) : null}
          </Fact>
          <Fact label={copy.startDate}>{formatDate(offer.proposedStartDate) || '–'}</Fact>
          <Fact label={copy.equity}>{offer.equityUnits ?? '–'}</Fact>
        </dl>

        {detail.approvals.length ? (
          <ApprovalStepper
            detail={detail}
            offerId={offerId}
            active={status === 'pending_approval'}
          />
        ) : null}

        {status === 'approved' ? <Callout tone="success">{copy.allApproved}</Callout> : null}
        {status === 'declined' ? <Callout tone="destructive">{copy.declinedHint}</Callout> : null}
        {status === 'sent' ? <Callout>{copy.sentHint}</Callout> : null}
        {status === 'accepted' ? (
          <Callout tone="success">{hiredStage ? copy.hired : copy.noHiredStage}</Callout>
        ) : null}

        <OfferPrefilled detail={detail} />

        {offer.candidateIntro || offer.searchOverview ? (
          <div className="space-y-3">
            {offer.candidateIntro ? <Note label={copy.intro}>{offer.candidateIntro}</Note> : null}
            {offer.searchOverview ? (
              <Note label={copy.overview}>{offer.searchOverview}</Note>
            ) : null}
          </div>
        ) : null}
      </DrawerFormBody>

      <DrawerFormFooter error={error ? errorMessage(error) : undefined}>
        {status === 'draft' ? (
          <>
            <Button variant="outline" disabled={busy} onClick={onEdit}>
              <Pencil data-icon="inline-start" />
              {copy.edit}
            </Button>
            <Button
              disabled={busy}
              onClick={() => submit.mutate({ offerId, approvers: offerApprovers(detail) })}
            >
              <Send data-icon="inline-start" />
              {copy.submitForApproval}
            </Button>
          </>
        ) : null}
        {status === 'declined' ? (
          <Button disabled={busy} onClick={onEdit}>
            <Pencil data-icon="inline-start" />
            {copy.resubmit}
          </Button>
        ) : null}
        {status === 'approved' ? (
          <Button disabled={busy} onClick={() => setStatus.mutate({ offerId, status: 'sent' })}>
            <Send data-icon="inline-start" />
            {copy.markSent}
          </Button>
        ) : null}
        {status === 'sent' ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setStatus.mutate({ offerId, status: 'rejected' })}
            >
              <X data-icon="inline-start" />
              {copy.turnedDown}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                accept.mutate({ offerId, applicationId, hiredStageId: hiredStage?.id ?? null })
              }
            >
              <CircleCheckBig data-icon="inline-start" />
              {copy.accepted}
            </Button>
          </>
        ) : null}
        {status === 'pending_approval' || status === 'accepted' || status === 'rejected' ? (
          <Button variant="outline" onClick={onClose}>
            {appCopy.common.close}
          </Button>
        ) : null}
      </DrawerFormFooter>
    </>
  )
}

// Hiring manager, department head, VP Operations, CEO: each signs off in order, so only the
// first open step can be decided.
function ApprovalStepper({
  detail,
  offerId,
  active,
}: {
  detail: OfferDetail
  offerId: Uuid
  active: boolean
}) {
  const me = useCurrentUser()
  const decide = useDecideApproval()
  const [note, setNote] = useState('')
  const approvals = detail.approvals
  const current = active ? approvals.find((step) => step.decision === 'pending') : undefined
  const done = approvals.filter((step) => step.decision === 'approved').length

  function decideCurrent(step: OfferApproval, decision: 'approved' | 'declined') {
    if (!detail.candidateId) return

    decide.mutate(
      {
        approvalId: step.id,
        offerId,
        decision,
        // An unassigned step records whoever decided it.
        userId: step.approverUserId ? null : (me?.id ?? null),
        note: note.trim() || null,
        notify: {
          candidateId: detail.candidateId,
          body: copy.approvedNote(
            candidateName(detail.candidates),
            detail.requisitions?.title ?? '',
          ),
        },
      },
      { onSuccess: () => setNote('') },
    )
  }

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{copy.approvals}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {copy.approvalProgress(done, approvals.length)}
        </span>
      </header>
      <ol>
        {approvals.map((step, index) => {
          const decision = step.decision ?? 'pending'
          const isCurrent = step.id === current?.id
          const previous = approvals[index - 1]

          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < approvals.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-7 bottom-1 left-3 w-px',
                    decision === 'approved' ? 'bg-success/50' : 'bg-border',
                  )}
                />
              ) : null}
              <StepIcon decision={decision} current={isCurrent} />
              <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium">
                    {optionLabel('approverRole', step.approverRole)}
                  </p>
                  {decision !== 'pending' ? (
                    <span className="text-xs text-muted-foreground">
                      {optionLabel('decision', decision)} <RelativeTime value={step.decidedAt} />
                    </span>
                  ) : null}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {step.approver ? (
                    <>
                      <UserAvatar user={step.approver} size="sm" className="size-4" />
                      {userName(step.approver)}
                    </>
                  ) : (
                    copy.unassigned
                  )}
                  {decision === 'pending' && !isCurrent && active && previous ? (
                    <>
                      <span aria-hidden="true">·</span>
                      {copy.waitingOn(optionLabel('approverRole', previous.approverRole))}
                    </>
                  ) : null}
                </p>
                {step.note ? (
                  <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-sm whitespace-pre-line">
                    {step.note}
                  </p>
                ) : null}
                {isCurrent ? (
                  <div className="space-y-2 pt-1">
                    <Textarea
                      aria-label={copy.note}
                      value={note}
                      rows={2}
                      placeholder={copy.notePlaceholder}
                      onChange={(event) => setNote(event.target.value)}
                      className="min-h-14"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decide.isPending}
                        onClick={() => decideCurrent(step, 'declined')}
                      >
                        <X data-icon="inline-start" />
                        {copy.decline}
                      </Button>
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decideCurrent(step, 'approved')}
                      >
                        <Check data-icon="inline-start" />
                        {copy.approve}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {decide.error ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage(decide.error)}
        </p>
      ) : null}
    </section>
  )
}

export function StepIcon({ decision, current = false }: { decision: string; current?: boolean }) {
  return (
    <span
      className={cn(
        'relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background [&_svg]:size-3.5',
        decision === 'approved' && 'border-success bg-success text-white',
        decision === 'declined' && 'border-destructive bg-destructive text-white',
        decision === 'pending' &&
          (current ? 'border-foreground text-foreground' : 'text-muted-foreground'),
      )}
    >
      {decision === 'approved' ? <Check /> : decision === 'declined' ? <X /> : <Clock />}
    </span>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-line">{children}</p>
    </div>
  )
}

function Callout({ tone, children }: { tone?: 'success' | 'destructive'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'rounded-lg border px-3 py-2 text-sm',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'destructive' && 'border-destructive/30 bg-destructive/5 text-destructive',
        !tone && 'bg-muted/40 text-muted-foreground',
      )}
    >
      {children}
    </p>
  )
}
