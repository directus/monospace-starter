import { FilePlus2, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { OfferStatusChip } from '@/modules/ats/components/interviews/offer-drawer'
import type { CandidateApplication, CandidateOffer } from '@/modules/ats/data/candidates'
import { OfferIcon } from '@/modules/ats/icons'

const copy = atsCopy.candidates.offer

// The offer stage is a form step, not an interview: an application there gets an offer callout
// (create it, or see where its approval chain stands) instead of interview cues.
export function needsOfferCallout(
  application: CandidateApplication,
  offer: CandidateOffer | undefined,
) {
  if (offer) return true

  if (application.status !== 'active') return false

  const stage = application.stages.find((row) => row.id === application.interviewStageId)

  return stage?.kind === 'offer'
}

export function OfferCallout({
  application,
  offer,
  showJob = false,
  onOpen,
  className,
}: {
  application: CandidateApplication
  offer: CandidateOffer | undefined
  // On Overview, name the job; inside an application card it's already the heading.
  showJob?: boolean
  onOpen: () => void
  className?: string
}) {
  const pending = offer?.status === 'pending_approval'
  const steps = offer?.steps || 4

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card px-4 py-3.5',
        !offer && 'border-emerald-500/30 bg-emerald-500/[0.04]',
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        <OfferIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
          {showJob ? copy.titleFor(application.requisitions?.title ?? '') : copy.title}
          {offer ? <OfferStatusChip status={offer.status} /> : null}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {offer ? (
            <>
              {offer.baseSalary ? (
                <span className="text-foreground tabular-nums">
                  {formatMoney(offer.baseSalary, offer.currency ?? 'USD')}
                </span>
              ) : null}
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: steps }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          'h-1.5 w-4 rounded-full bg-muted',
                          index < offer.approved && 'bg-emerald-500',
                        )}
                      />
                    ))}
                  </span>
                  {copy.approvals(offer.approved, steps)}
                </span>
              ) : null}
            </>
          ) : (
            copy.ready
          )}
        </p>
      </div>
      <Button variant={offer ? 'outline' : 'default'} className="max-sm:w-full" onClick={onOpen}>
        {offer ? <FileText data-icon="inline-start" /> : <FilePlus2 data-icon="inline-start" />}
        {offer ? copy.view : copy.create}
      </Button>
    </div>
  )
}
