import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export type AvatarVariant = 'circle' | 'square'

export function EntityAvatar({
  label,
  image,
  variant = 'circle',
  size = 'sm',
  className,
}: {
  label: string
  image?: string
  variant?: AvatarVariant
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const square = variant === 'square'

  return (
    <Avatar size={size} className={cn(square && 'rounded-md after:rounded-md', className)}>
      {image ? (
        <AvatarImage
          src={image}
          alt=""
          className={cn(square && 'block rounded-md bg-white object-contain')}
        />
      ) : null}
      <AvatarFallback
        className={cn(
          square && 'rounded-md',
          variant === 'circle' && 'text-xs group-data-[size=sm]/avatar:text-[10px]',
        )}
      >
        {initials(label)}
      </AvatarFallback>
    </Avatar>
  )
}
