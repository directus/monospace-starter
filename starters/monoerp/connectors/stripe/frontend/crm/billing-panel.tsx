import { CreditCard } from 'lucide-react'

import { DataError, DataLoading } from '@/components/data-state'
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
import { enumLabel, formatDate, formatMoney } from '@/lib/format'
import { billingSummary, chargeAmount } from './billing'
import { Empty, Metric, Unlinked } from '@/components/source-panel'
import { billingCopy } from './billing.copy'
import type { StripeCustomer } from './data'

const copy = billingCopy

// What Stripe knows about this organization, read through Monospace's Stripe connector. Stripe
// bills the portal account, so the chain is organization -> portal account -> Stripe customer.
// Loads on its own, so a Stripe outage is one retryable error here, and a workspace without
// Stripe says so.
export function BillingPanel({
  connected,
  customer,
  pending,
  error,
  onRetry,
}: {
  connected: boolean
  customer: StripeCustomer | null | undefined
  pending: boolean
  error: Error | null
  onRetry: () => void
}) {
  if (!connected) return <Unlinked title={billingCopy.notConnected}>{copy.connect}</Unlinked>

  if (pending) return <DataLoading rows={4} />

  if (isMissingFromWorkspace(error))
    return <Unlinked title={copy.notSetUp}>{copy.addSource}</Unlinked>

  if (error) {
    return (
      <div className="space-y-3">
        <DataError error={error} />
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {appCopy.auth.tryAgain}
        </Button>
      </div>
    )
  }

  if (!customer) return <Empty>{copy.noCustomer}</Empty>

  return <CustomerBilling customer={customer} />
}

function CustomerBilling({ customer }: { customer: StripeCustomer }) {
  const charges = customer.charges?.data ?? []
  const summary = billingSummary(charges)
  const last = summary.lastPayment

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-4 text-sm">
        <span className="inline-flex max-w-full min-w-0 items-center gap-2 font-medium">
          <CreditCard className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{customer.name ?? customer.id}</span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{customer.id}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {copy.title} · {copy.readOnly} · {copy.customerSince(formatDate(customer.created))}
        </span>
      </div>

      <dl className="grid overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3 lg:divide-x">
        <Metric
          label={copy.lifetimeValue}
          value={formatMoney(summary.lifetimeValue)}
          hint={copy.paymentCount(summary.paymentCount)}
        />
        <Metric
          label={copy.lastPayment}
          value={last ? formatMoney(chargeAmount(last)) : copy.noPayments}
          hint={
            last
              ? `${formatDate(last.created)} · ${enumLabel(copy.chargeStatuses, last.status)}`
              : undefined
          }
          tone={last?.status === 'failed' ? 'warn' : 'normal'}
        />
        <Metric
          label={copy.failed}
          value={String(summary.failedCount)}
          hint={summary.failedCount ? copy.failedHint : undefined}
          tone={summary.failedCount ? 'warn' : 'normal'}
        />
      </dl>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.payments}
        </h2>
        {charges.length ? (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.description}</TableHead>
                  <TableHead className="text-right">{copy.amount}</TableHead>
                  <TableHead className="max-sm:hidden">{copy.status}</TableHead>
                  <TableHead className="max-sm:hidden">{copy.date}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charges.map((charge) => (
                  <TableRow key={charge.id}>
                    <TableCell className="font-medium">{charge.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(chargeAmount(charge), charge.currency?.toUpperCase())}
                    </TableCell>
                    <TableCell className="max-sm:hidden">
                      <Badge variant={charge.status === 'failed' ? 'destructive' : 'secondary'}>
                        {enumLabel(copy.chargeStatuses, charge.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">
                      {formatDate(charge.created)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>{copy.noPayments}</Empty>
        )}
      </section>
    </div>
  )
}
