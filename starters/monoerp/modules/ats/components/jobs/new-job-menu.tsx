import { useQuery } from '@tanstack/react-query'
import { FilePlus2, FileText, Plus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Uuid } from '@/generated/monospace'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { JobFormDrawer } from '@/modules/ats/components/jobs/job-form'
import { KickoffFormDrawer } from '@/modules/ats/components/requests/kickoff-form'
import { requestsWithoutJobQuery } from '@/modules/ats/data/jobs'

const copy = atsCopy.jobs.create

// New job: from an approved role request (runs its kickoff) or blank.
export function NewJobMenu({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const requests = useQuery({ ...requestsWithoutJobQuery(), enabled: menuOpen })
  const [kickoff, setKickoff] = useState<Uuid>()
  const [blank, setBlank] = useState(false)

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              className={cn(compact && 'max-md:ml-auto max-md:w-10 max-md:px-0!', className)}
            />
          }
        >
          <Plus data-icon="inline-start" />
          <span className={cn(compact && 'max-md:sr-only')}>{copy.button}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{copy.fromRequest}</DropdownMenuLabel>
            {requests.data?.length ? (
              requests.data.map((request) => (
                <DropdownMenuItem key={request.id} onClick={() => setKickoff(request.id)}>
                  <FileText />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{request.roleName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        request.departments?.name,
                        atsCopy.jobs.openings(request.numberOfHires ?? 1),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {requests.isPending ? copy.loading : copy.noRequests}
              </p>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setBlank(true)}>
            <FilePlus2 />
            <span className="min-w-0 flex-1">
              <span className="block">{copy.blank}</span>
              <span className="block text-xs text-muted-foreground">{copy.blankHint}</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {kickoff ? (
        <KickoffFormDrawer
          key={kickoff}
          roleRequestId={kickoff}
          open
          onOpenChange={(open) => !open && setKickoff(undefined)}
        />
      ) : null}
      <JobFormDrawer open={blank} onOpenChange={setBlank} />
    </>
  )
}
