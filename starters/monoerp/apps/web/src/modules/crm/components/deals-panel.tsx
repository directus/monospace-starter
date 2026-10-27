import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import type { RelationOption } from '@/components/form/relation-combobox'
import { Button } from '@/components/ui/button'
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/ui/frame'
import { appCopy } from '@/lib/app.copy'
import { formatDate, formatMoney } from '@/lib/format'
import { useCollectionAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { DealDrawer } from '@/modules/crm/components/deal-form'
import { StageDot } from '@/modules/crm/components/stage-dot'
import { crmCopy } from '@/modules/crm/crm.copy'
import type { OrganizationDetail } from '@/modules/crm/data'

type Deal = NonNullable<OrganizationDetail['opportunities']>['data'][number]

// Open deals by default, with a quick flip to everything. Each row is the deal at a glance:
// stage dot, value, expected close.
export function DealsPanel({
  deals,
  organization,
  className,
}: {
  deals: Array<Deal>
  organization: RelationOption
  className?: string
}) {
  const access = useCollectionAccess('opportunities')
  const [scope, setScope] = useState<'open' | 'all'>('open')
  const open = deals.filter((deal) => deal.status === 'open')
  const rows = scope === 'open' ? open : deals
  const copy = crmCopy.organizations.deals

  return (
    <Frame stacked dense className={className}>
      <FrameHeader className="flex-row items-center justify-between gap-2 px-5 py-3">
        <FrameTitle className="flex items-center gap-2">
          {crmCopy.deals.title}
          <span className="inline-flex gap-0.5 rounded-md bg-muted p-0.5 text-xs font-normal">
            <ScopeButton active={scope === 'open'} onClick={() => setScope('open')}>
              {copy.open} {open.length}
            </ScopeButton>
            <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
              {copy.all} {deals.length}
            </ScopeButton>
          </span>
        </FrameTitle>
        {access.create ? (
          <DealDrawer
            defaultOrganization={organization}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={appCopy.form.add(crmCopy.deals.singular)}
              >
                <Plus />
              </Button>
            }
          />
        ) : null}
      </FrameHeader>
      {rows.length ? (
        rows.map((deal, index) => {
          const stage = deal.pipeline_stages
          const stageName = stage?.name ?? crmCopy.deals.restrictedStage

          const outcome =
            deal.status === 'won'
              ? crmCopy.deals.statuses.won
              : deal.status === 'lost'
                ? crmCopy.deals.statuses.lost
                : null

          return (
            <FramePanel key={deal.id ?? index}>
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  {deal.id ? (
                    <Link
                      to="/crm/deals/$dealId"
                      params={{ dealId: deal.id }}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {deal.title ?? crmCopy.deals.restricted}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">
                      {deal.title ?? crmCopy.deals.restricted}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {stage ? (
                      <StageDot
                        stage={stage}
                        index={index}
                        className={cn('size-2', outcome && 'opacity-40')}
                      />
                    ) : null}
                    <span>{outcome ?? stageName}</span>
                    {deal.expectedCloseDate ? (
                      <span>· {crmCopy.deals.expected(formatDate(deal.expectedCloseDate))}</span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatMoney(deal.valueAmount, deal.currency ?? undefined)}
                </span>
              </div>
            </FramePanel>
          )
        })
      ) : (
        <FramePanel className="px-5 py-4">
          <p className="text-sm text-muted-foreground">
            {scope === 'open' && deals.length
              ? crmCopy.organizations.noOpenDeals
              : crmCopy.organizations.noDeals}
          </p>
        </FramePanel>
      )}
      {deals.length ? (
        <FramePanel className="px-5 py-2">
          <Link
            to="/crm/deals"
            search={{ q: organization.label }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground pointer-coarse:min-h-10"
          >
            {copy.viewAll}
            <ArrowUpRight className="size-3" />
          </Link>
        </FramePanel>
      ) : null}
    </Frame>
  )
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-1.5 py-0.5 tabular-nums transition-colors pointer-coarse:px-2.5 pointer-coarse:py-1.5',
        active
          ? 'bg-background text-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
