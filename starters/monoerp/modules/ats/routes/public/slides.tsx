import { createFileRoute } from '@tanstack/react-router'
import { useCallback } from 'react'
import { z } from 'zod'

import { atsCopy } from '@/modules/ats/ats.copy'
import { SlideDeck } from '@/modules/ats/components/slides/slide-deck'
import { demoSlides } from '@/modules/ats/components/slides/slides'

// The live demo deck. Public like the careers site, so it runs on any screen without signing in;
// the hiring slide reads the demo job through Monospace's public role.
export const Route = createFileRoute('/slides')({
  // The QR code uses the browser's origin, and the client only resolves relative URLs there.
  ssr: false,
  validateSearch: z.object({
    slide: z.number().int().min(1).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: atsCopy.slides.pageTitle }] }),
  component: SlidesPage,
})

function SlidesPage() {
  const { slide = 1 } = Route.useSearch()
  const navigate = Route.useNavigate()

  const onIndexChange = useCallback(
    (index: number) =>
      void navigate({ search: { slide: index > 0 ? index + 1 : undefined }, replace: true }),
    [navigate],
  )

  return <SlideDeck slides={demoSlides} index={slide - 1} onIndexChange={onIndexChange} />
}
