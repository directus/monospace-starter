import { ShieldCheck } from 'lucide-react'

import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.careers.privacy

// Shown in full right above the consent box, so agreeing never means opening another page.
export function PrivacyNotice() {
  return (
    <section
      id="privacy"
      aria-labelledby="privacy-title"
      className="scroll-mt-24 rounded-xl border bg-muted/30"
    >
      <header className="flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-(--brand-soft) text-(--brand)">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <h3 id="privacy-title" className="text-sm font-semibold">
            {copy.title}
          </h3>
          <p className="text-sm text-muted-foreground">{copy.intro}</p>
        </div>
      </header>
      <dl
        tabIndex={0}
        aria-label={copy.title}
        className="grid max-h-72 gap-x-8 gap-y-4 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-(--brand) sm:grid-cols-2 sm:px-5"
      >
        {copy.sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <dt className="text-sm font-medium">{section.title}</dt>
            <dd className="text-sm leading-6 text-muted-foreground">{section.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
