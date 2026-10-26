import { Radio } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive className={cn('grid gap-2', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: ComponentProps<typeof Radio.Root>) {
  return (
    <Radio.Root
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-sm transition-[background-color,border-color,color] duration-150 ease-out outline-none hover:bg-muted data-checked:border-foreground data-checked:bg-muted data-focused:ring-3 data-focused:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
