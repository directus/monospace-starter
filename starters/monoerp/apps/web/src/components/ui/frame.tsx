import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const frameVariants = cva(
  'group/frame relative flex flex-col rounded-[var(--frame-radius)] [--frame-panel-radius:calc(var(--frame-radius)-var(--frame-inset)-1px)] [--frame-radius:var(--radius-xl)]',
  {
    variants: {
      variant: {
        default: 'border bg-muted/50',
        ghost: 'bg-transparent [--frame-panel-radius:calc(var(--frame-radius)-var(--frame-inset))]',
      },
      spacing: {
        sm: 'gap-0.5 p-0.5 [--frame-inset:--spacing(0.5)]',
        default: 'gap-1 p-1 [--frame-inset:--spacing(1)]',
        lg: 'gap-2 p-2 [--frame-inset:--spacing(2)]',
      },
      stacked: {
        true: 'gap-0 [&>[data-slot=frame-panel]+[data-slot=frame-panel]]:rounded-t-none [&>[data-slot=frame-panel]+[data-slot=frame-panel]]:border-t-0 [&>[data-slot=frame-panel]:has(+[data-slot=frame-panel])]:rounded-b-none',
        false: '',
      },
      dense: {
        true: 'gap-0 p-0 [--frame-inset:0px] [--frame-panel-radius:var(--frame-radius)] [&>[data-slot=frame-panel]]:-mx-px [&>[data-slot=frame-panel]:first-child]:-mt-px [&>[data-slot=frame-panel]:last-child]:-mb-px',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      spacing: 'default',
      stacked: false,
      dense: false,
    },
  },
)

function Frame({
  className,
  variant,
  spacing,
  stacked,
  dense,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof frameVariants>) {
  return (
    <div
      data-slot="frame"
      className={cn(frameVariants({ variant, spacing, stacked, dense }), className)}
      {...props}
    />
  )
}

function FramePanel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="frame-panel"
      className={cn(
        'relative grow overflow-hidden rounded-[var(--frame-panel-radius)] border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  )
}

function FrameHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      data-slot="frame-panel-header"
      className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)}
      {...props}
    />
  )
}

function FrameTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2 data-slot="frame-title" className={cn('text-sm font-semibold', className)} {...props} />
  )
}

function FrameDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="frame-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function FrameFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      data-slot="frame-footer"
      className={cn('flex items-center gap-2 border-t px-5 py-3', className)}
      {...props}
    />
  )
}

export { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle, frameVariants }
