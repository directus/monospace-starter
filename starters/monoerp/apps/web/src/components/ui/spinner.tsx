import { Loader2Icon } from 'lucide-react'

import { appCopy } from '@/lib/app.copy'

import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={appCopy.data.loading}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
