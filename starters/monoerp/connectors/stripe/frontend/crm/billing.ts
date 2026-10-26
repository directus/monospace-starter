// Sums over a Stripe customer's charges. Stripe (and so Monospace) can't aggregate, so these
// run over the charges the Billing tab loads.
export type StripeCharge = {
  amount?: string | null
  currency?: string | null
  status?: string | null
  created?: string | null
}

// Stripe amounts are in the currency's smallest unit, and Monospace sends them as strings.
// Every seeded charge is USD, which has two decimals.
export function chargeAmount(charge: StripeCharge) {
  return charge.amount == null ? null : String(Number(charge.amount) / 100)
}

export function billingSummary(charges: ReadonlyArray<StripeCharge>) {
  const paid = charges.filter((charge) => charge.status === 'succeeded')

  return {
    lifetimeValue: String(
      paid.reduce((total, charge) => total + Number(charge.amount ?? 0), 0) / 100,
    ),
    paymentCount: paid.length,
    failedCount: charges.filter((charge) => charge.status === 'failed').length,
    // Charges arrive newest first.
    lastPayment: charges[0] ?? null,
  }
}
