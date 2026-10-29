import { Link2Off } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Metric({
  label,
  value,
  hint,
  tone = 'normal',
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: 'normal' | 'warn' | 'muted'
}) {
  return (
    <div className="space-y-1 p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint ? (
        <p className={cn('text-xs', tone === 'warn' ? 'text-warning' : 'text-muted-foreground')}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// Nothing to show because something isn't linked, as opposed to failing to load.
export function Unlinked({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Link2Off className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export function Empty({
  children,
  title,
  icon,
  className,
}: {
  children: React.ReactNode
  title?: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      {icon ? <div className="mb-4 rounded-xl bg-muted p-3">{icon}</div> : null}
      {title ? <h2 className="font-medium text-foreground">{title}</h2> : null}
      <div className={cn(title && 'mt-1 max-w-xs')}>{children}</div>
    </div>
  )
}
