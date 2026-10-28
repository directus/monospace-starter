import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.careers

// The public careers site's own frame: no app shell, no sign-in. Directus purple is the one
// accent; everything else uses the app's theme tokens so dark mode still reads.
export function CareersShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground [--brand-soft:color-mix(in_oklch,var(--brand)_10%,transparent)] [--brand:#6644ff]">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-5 sm:px-8">
          <Link
            to="/careers"
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-(--brand)"
          >
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight">{copy.company}</span>
            <span className="text-[15px] text-muted-foreground">{copy.hero.eyebrow}</span>
          </Link>
          <nav className="ml-auto flex items-center gap-5 text-sm text-muted-foreground">
            <Link to="/careers" hash="roles" className="hover:text-foreground max-sm:hidden">
              {copy.nav.jobs}
            </Link>
            <a href={copy.nav.homeUrl} className="hover:text-foreground">
              {copy.nav.home}
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <p className="max-w-md">{copy.footer.equal}</p>
          <span className="shrink-0">{copy.footer.copyright(new Date().getFullYear())}</span>
        </div>
      </footer>
    </div>
  )
}

function BrandMark() {
  return (
    <span
      aria-hidden
      className="grid size-7 place-items-center rounded-lg bg-(--brand) text-[13px] font-bold text-white"
    >
      D
    </span>
  )
}
