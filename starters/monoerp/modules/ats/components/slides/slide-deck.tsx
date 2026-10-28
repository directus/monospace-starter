import { ChevronLeft, ChevronRight, Maximize } from 'lucide-react'
import { useEffect, type MouseEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.slides

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'])

const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

// `inverted` is for slides with a dark or brand background: the deck's footer turns white.
export type DeckSlide = { content: ReactNode; inverted?: boolean }

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

// A 16:9 stage that fills the screen. Everything inside sizes in container units (cqw), so a
// slide looks the same on a laptop and a projector.
export function SlideDeck({
  slides,
  index,
  onIndexChange,
}: {
  slides: ReadonlyArray<DeckSlide>
  index: number
  onIndexChange: (index: number) => void
}) {
  const last = slides.length - 1
  const current = Math.min(Math.max(index, 0), last)
  const inverted = slides[current]?.inverted ?? false

  useEffect(() => {
    const go = (to: number) => onIndexChange(Math.min(Math.max(to, 0), last))

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (NEXT_KEYS.has(event.key)) go(current + 1)
      else if (PREVIOUS_KEYS.has(event.key)) go(current - 1)
      else if (event.key === 'Home') go(0)
      else if (event.key === 'End') go(last)
      else if (event.key === 'f' || event.key === 'F') toggleFullscreen()
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, last, onIndexChange])

  function onStageClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('a, button')) return

    onIndexChange(Math.min(current + 1, last))
  }

  return (
    <div className="fixed inset-0 grid place-items-center overflow-hidden bg-zinc-950 [--brand-soft:color-mix(in_oklch,var(--brand)_10%,transparent)] [--brand:#6644ff]">
      <section
        aria-roledescription="carousel"
        aria-label={copy.deckLabel}
        onClick={onStageClick}
        className="@container relative aspect-video w-[min(100vw,calc(100dvh*16/9))] cursor-pointer overflow-hidden bg-background text-foreground select-none"
      >
        <div
          key={current}
          aria-roledescription="slide"
          aria-label={copy.counter(current + 1, slides.length)}
          className="absolute inset-0 animate-in duration-500 fade-in-0"
        >
          {slides[current]?.content}
        </div>
        <div
          className={cn(
            'absolute inset-x-[4cqw] bottom-[2.2cqw] flex items-center gap-[1cqw] text-[1cqw]',
            inverted
              ? 'text-white/75 [&_button:hover]:bg-white/15 [&_button:hover]:text-white'
              : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-[0.6cqw] font-semibold',
              inverted ? 'text-white' : 'text-foreground',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-[1.8cqw] place-items-center rounded-[0.4cqw] text-[0.9cqw]',
                inverted ? 'bg-white text-(--brand)' : 'bg-(--brand) text-white',
              )}
            >
              D
            </span>
            {atsCopy.careers.company}
          </span>
          <span className="ml-auto tabular-nums" aria-live="polite">
            {copy.counter(current + 1, slides.length)}
          </span>
          <DeckButton
            label={copy.previous}
            onClick={() => onIndexChange(current - 1)}
            disabled={current === 0}
          >
            <ChevronLeft />
          </DeckButton>
          <DeckButton
            label={copy.next}
            onClick={() => onIndexChange(current + 1)}
            disabled={current === last}
          >
            <ChevronRight />
          </DeckButton>
          <DeckButton label={copy.fullscreen} onClick={toggleFullscreen}>
            <Maximize />
          </DeckButton>
        </div>
      </section>
    </div>
  )
}

function DeckButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-[2.4cqw] place-items-center rounded-full outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--brand) disabled:opacity-30 [&_svg]:size-[1.2cqw]"
    >
      {children}
    </button>
  )
}
