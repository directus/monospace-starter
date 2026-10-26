import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export type EntityVisual = 'avatar' | 'contact' | 'organization'

export function EntityAvatar({
  label,
  image,
  visual,
  size = 'sm',
  className,
}: {
  label: string
  image?: string
  visual: EntityVisual
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const organization = visual === 'organization'

  return (
    <Avatar size={size} className={cn(organization && 'rounded-md after:rounded-md', className)}>
      {image ? (
        <AvatarImage
          src={image}
          alt=""
          className={cn(organization && 'block rounded-md bg-white object-contain')}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          organization && 'rounded-md',
          visual === 'contact' && 'text-xs group-data-[size=sm]/avatar:text-[10px]',
        )}
      >
        {organization ? null : initials(label)}
      </AvatarFallback>
    </Avatar>
  )
}
