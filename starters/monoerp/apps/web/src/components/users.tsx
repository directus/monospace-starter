import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { RelationOption } from '@/components/form/relation-combobox'
import { appCopy } from '@/lib/app.copy'
import { avatarUrl, initials } from '@/lib/format'
import type { OwnerLike } from '@/lib/format'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'default' | 'lg'

const textSize: Record<Size, string> = { sm: 'text-sm', default: 'text-sm', lg: 'text-base' }

export function userName(user: OwnerLike | null | undefined) {
  return user?.fullName ?? user?.email ?? appCopy.fallback.unassigned
}

// Pickers hand back a RelationOption; turn it into something the user components render.
export function userFromOption(option: RelationOption): OwnerLike & { avatarUrl?: string } {
  return { id: option.value, fullName: option.label, avatarUrl: option.image }
}

export function UserAvatar({
  user,
  size = 'default',
  className,
}: {
  user: (OwnerLike & { avatarUrl?: string }) | null | undefined
  size?: Size
  className?: string
}) {
  const src = user?.avatarUrl ?? avatarUrl(user?.avatarId)

  return (
    <Avatar size={size} className={className}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className={cn(!user && 'border border-dashed bg-transparent')}>
        {user ? initials(userName(user)) : null}
      </AvatarFallback>
    </Avatar>
  )
}

export function UserLabel({
  user,
  size = 'default',
  className,
}: {
  user: (OwnerLike & { avatarUrl?: string }) | null | undefined
  size?: Size
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2',
        !user && 'text-muted-foreground',
        className,
      )}
    >
      <UserAvatar user={user} size={size} />
      <span className={cn('truncate', textSize[size])}>{userName(user)}</span>
    </span>
  )
}
