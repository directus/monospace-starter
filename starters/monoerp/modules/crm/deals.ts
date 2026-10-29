import type { PipelineStage } from '@/modules/crm/data'

type DealValue = { valueAmount?: string | null; currency?: string | null }

export function statusForStage(stage: Pick<PipelineStage, 'isWon' | 'isClosed'>) {
  return stage.isWon ? 'won' : stage.isClosed ? 'lost' : 'open'
}

export function dealsByCurrency<T extends DealValue>(deals: ReadonlyArray<T>) {
  const groups = new Map<string, Array<T>>()

  for (const deal of deals) {
    const currency = deal.currency ?? 'USD'
    const group = groups.get(currency) ?? []
    group.push(deal)
    groups.set(currency, group)
  }

  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}

export function totalsByCurrency(deals: ReadonlyArray<DealValue>) {
  return dealsByCurrency(deals).map(([currency, rows]) => ({
    currency,
    total: rows.reduce((sum, row) => {
      const value = Number(row.valueAmount ?? 0)

      return sum + (Number.isFinite(value) ? value : 0)
    }, 0),
  }))
}
