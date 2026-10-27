import { useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserAvatar, userName } from '@/components/users'
import type { OwnerLike } from '@/lib/users'
import { crmCopy } from '@/modules/crm/crm.copy'

// Avatar that reveals who it is on hover, with a one-click "show only this person" filter.
export function OwnerPopover({
  user,
  onFilter,
}: {
  user: OwnerLike | null | undefined
  onFilter?: (user: OwnerLike) => void
}) {
  const [open, setOpen] = useState(false)

  if (!user?.id) return <UserAvatar user={user} size="sm" className="shrink-0" />

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={200}
        render={
          <button
            type="button"
            className="relative shrink-0 rounded-full outline-none pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
          />
        }
        aria-label={userName(user)}
      >
        <UserAvatar user={user} size="sm" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto min-w-52 gap-2 p-3">
        <div className="flex items-center gap-2.5">
          <UserAvatar user={user} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName(user)}</p>
            {user.email ? (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            ) : null}
          </div>
        </div>
        {onFilter ? (
          <button
            type="button"
            className="self-start text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false)
              onFilter(user)
            }}
          >
            {crmCopy.activity.showOnly(userName(user))}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
