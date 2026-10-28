import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FilePlus2 } from 'lucide-react'
import { useState } from 'react'

import { DataError, DataLoading } from '@/components/data-state'
import { Button } from '@/components/ui/button'
import type { Uuid } from '@/generated/monospace'
import { formatDate, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy, optionLabel } from '@/modules/ats/ats.copy'
import { OfferDrawer, OfferStatusChip } from '@/modules/ats/components/interviews/offer-drawer'
import { offerQuery } from '@/modules/ats/data/interviews'
import { OfferIcon } from '@/modules/ats/icons'

const copy = atsCopy.interviews.offer

// Offers open at the Offer stage; later stages still show the one they have.
const OFFER_STAGES = new Set(['offer', 'hired'])

// A summary of the application's offer. Everything else happens in OfferDrawer.
export function OfferPanel({ applicationId }: { applicationId: Uuid }) {
  const detail = useQuery(offerQuery(applicationId))
  const [open, setOpen] = useState(false)

  if (detail.isPending) return <DataLoading rows={2} />

  if (detail.isError) return <DataError error={detail.error} />

  const offer = detail.data.offers
  const canCreate = OFFER_STAGES.has(detail.data.interview_stages?.kind ?? '')
  const approvals = detail.data.approvals

  if (!offer?.id && !canCreate) return null

  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <OfferIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{copy.title}</h2>
            <OfferStatusChip status={offer?.status} />
          </div>
          {offer?.id ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {formatMoney(offer.baseSalary, offer.currency ?? 'USD')}
              </span>
              {offer.proposedStartDate ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {copy.startDate} {formatDate(offer.proposedStartDate)}
                  </span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          )}
        </div>
        {offer?.id ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {copy.open}
            <ChevronRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => setOpen(true)}>
            <FilePlus2 data-icon="inline-start" />
            {copy.create}
          </Button>
        )}
      </div>

      {approvals.length ? (
        <div className="flex items-center gap-3 border-t px-4 py-2.5">
          <ol className="flex flex-1 items-center gap-1" aria-label={copy.approvals}>
            {approvals.map((step) => (
              <li
                key={step.id}
                title={optionLabel('approverRole', step.approverRole)}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  step.decision === 'approved' && 'bg-success',
                  step.decision === 'declined' && 'bg-destructive',
                  step.decision !== 'approved' && step.decision !== 'declined' && 'bg-muted',
                )}
              />
            ))}
          </ol>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {copy.approvalProgress(
              approvals.filter((step) => step.decision === 'approved').length,
              approvals.length,
            )}
          </span>
        </div>
      ) : null}

      <OfferDrawer applicationId={applicationId} open={open} onOpenChange={setOpen} />
    </section>
  )
}
