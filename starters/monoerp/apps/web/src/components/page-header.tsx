import type { ReactNode } from 'react'

export function PageHeader({
  avatar,
  title,
  description,
  actions,
}: {
  avatar?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:gap-4 md:border-b md:pb-5">
      <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
        {avatar}
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight break-words md:text-2xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
