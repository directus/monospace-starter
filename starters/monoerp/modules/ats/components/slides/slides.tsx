import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Clock,
  Cloud,
  Database,
  Fingerprint,
  KeyRound,
  Lock,
  NotebookPen,
  Sheet,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'
import { HiringQr } from '@/modules/ats/components/slides/hiring-qr'
import type { DeckSlide } from '@/modules/ats/components/slides/slide-deck'

const copy = atsCopy.slides

export const demoSlides: ReadonlyArray<DeckSlide> = [
  { content: <TitleSlide /> },
  { content: <ProblemSlide /> },
  { content: <FlowSlide /> },
  { content: <ArchitectureSlide /> },
  { content: <PrivacySlide /> },
  { content: <HiringSlide /> },
  { content: <DemoSlide />, inverted: true },
  { content: <ThanksSlide /> },
]

function Slide({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string
  title?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-full flex-col px-[6cqw] pt-[5cqw] pb-[7.5cqw]', className)}>
      {eyebrow ? (
        <p className="text-[1.15cqw] font-semibold tracking-[0.12em] text-(--brand) uppercase">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2 className="mt-[1cqw] max-w-[70cqw] text-[3.6cqw] leading-[1.1] font-semibold tracking-tight text-balance">
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  )
}

function Glow() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 -z-10 bg-[radial-gradient(70cqw_40cqw_at_15%_-10%,var(--brand-soft),transparent),radial-gradient(50cqw_30cqw_at_100%_110%,var(--brand-soft),transparent)]"
    />
  )
}

function TitleSlide() {
  return (
    <div className="relative isolate flex h-full flex-col justify-center px-[8cqw]">
      <Glow />
      <p className="text-[1.4cqw] font-semibold tracking-[0.12em] text-(--brand) uppercase">
        {copy.title.eyebrow}
      </p>
      <h1 className="mt-[2cqw] max-w-[72cqw] text-[6.4cqw] leading-[1.02] font-semibold tracking-tight text-balance">
        {copy.title.title}
      </h1>
      <p className="mt-[2.4cqw] text-[2.2cqw] text-muted-foreground">{copy.title.subtitle}</p>
    </div>
  )
}

const problemIcons = [Sheet, Wallet, ShieldCheck]

function ProblemSlide() {
  return (
    <Slide eyebrow={copy.problem.eyebrow} title={copy.problem.title}>
      <ul className="my-auto grid grid-cols-3 gap-[2.4cqw]">
        {copy.problem.points.map((point, index) => {
          const Icon = problemIcons[index] ?? Sheet

          return (
            <li key={point.title} className="border-t-[0.15cqw] border-foreground/10 pt-[1.8cqw]">
              <Icon className="size-[2.6cqw] text-(--brand)" strokeWidth={1.75} />
              <p className="mt-[1.4cqw] text-[1.9cqw] font-semibold">{point.title}</p>
              <p className="mt-[0.6cqw] text-[1.45cqw] leading-snug text-muted-foreground">
                {point.description}
              </p>
            </li>
          )
        })}
      </ul>
    </Slide>
  )
}

function FlowSlide() {
  return (
    <Slide eyebrow={copy.flow.eyebrow} title={copy.flow.title}>
      <div className="my-auto space-y-[2.6cqw]">
        <FlowRow label={copy.flow.plan} steps={copy.flow.planSteps} />
        <FlowRow label={copy.flow.hire} steps={copy.flow.hireSteps} highlightLast />
      </div>
    </Slide>
  )
}

function FlowRow({
  label,
  steps,
  highlightLast = false,
}: {
  label: string
  steps: ReadonlyArray<{ label: string; detail: string | null }>
  highlightLast?: boolean
}) {
  return (
    <div>
      <p className="mb-[1cqw] text-[1.1cqw] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <ol className="flex items-center gap-[0.8cqw]">
        {steps.map((step, index) => {
          const final = highlightLast && index === steps.length - 1

          return (
            <li key={step.label} className="flex flex-1 items-center gap-[0.8cqw]">
              <span
                className={cn(
                  'flex h-[7.5cqw] flex-1 flex-col items-center justify-center gap-[0.4cqw] rounded-[1cqw] border-[0.12cqw] px-[0.8cqw] text-center text-[1.4cqw] leading-tight font-medium',
                  final
                    ? 'border-(--brand) bg-(--brand) text-white'
                    : 'border-foreground/10 bg-background',
                )}
              >
                {step.label}
                {step.detail ? (
                  <span className="text-[1cqw] leading-snug font-normal text-(--brand)">
                    {step.detail}
                  </span>
                ) : null}
              </span>
              {index < steps.length - 1 ? (
                <ArrowRight className="size-[1.6cqw] shrink-0 text-(--brand)" />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ArchitectureSlide() {
  return (
    <Slide eyebrow={copy.architecture.eyebrow} title={copy.architecture.title}>
      <div className="my-auto flex flex-col items-center">
        <p className="rounded-[1cqw] border-[0.12cqw] border-foreground/10 bg-background px-[2.4cqw] py-[1cqw] text-[1.7cqw] font-semibold">
          {copy.architecture.app}
          <span className="font-normal text-muted-foreground">
            {' · '}
            {copy.architecture.appDetail}
          </span>
        </p>
        <ArrowDown className="my-[0.5cqw] size-[1.6cqw] text-(--brand)" />
        <Box
          title={copy.architecture.api}
          detail={copy.architecture.apiDetail}
          icon={<KeyRound />}
          notes={copy.architecture.apiNotes}
          inverted
          className="w-full"
        />
        <div className="grid w-full grid-cols-4 gap-[1.4cqw]">
          {copy.architecture.sources.map((source) => (
            <div key={source.name} className="flex flex-col items-center">
              <span aria-hidden className="h-[2.2cqw] w-[0.15cqw] bg-(--brand)" />
              <Box
                title={source.name}
                detail={source.detail}
                icon={<Database />}
                className="w-full flex-1"
              />
            </div>
          ))}
        </div>
        <p className="mt-[2cqw] flex items-center gap-[0.6cqw] text-[1.2cqw] text-muted-foreground [&_svg]:size-[1.4cqw] [&_svg]:text-(--brand)">
          <Cloud />
          {copy.architecture.hosting}
        </p>
      </div>
    </Slide>
  )
}

// `inverted` fills the box with the brand color, for the piece a diagram centers on.
function Box({
  title,
  detail,
  icon,
  notes = [],
  inverted = false,
  className,
}: {
  title: string
  detail: string
  icon?: ReactNode
  notes?: ReadonlyArray<string>
  inverted?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[1cqw] border-[0.12cqw] px-[1.6cqw] py-[1.2cqw] text-center',
        inverted
          ? 'border-(--brand) bg-(--brand) text-white'
          : 'border-foreground/10 bg-background',
        className,
      )}
    >
      <p className="flex items-center justify-center gap-[0.6cqw] text-[1.7cqw] font-semibold [&_svg]:size-[1.6cqw]">
        {icon}
        {title}
      </p>
      <p
        className={cn(
          'mt-[0.3cqw] text-[1.2cqw]',
          inverted ? 'text-white/80' : 'text-muted-foreground',
        )}
      >
        {detail}
      </p>
      {notes.length ? (
        <div className="mt-[0.8cqw] flex flex-wrap justify-center gap-[0.6cqw]">
          {notes.map((note) => (
            <span
              key={note}
              className={cn(
                'inline-flex items-center gap-[0.4cqw] rounded-full px-[0.9cqw] py-[0.3cqw] text-[1cqw] font-medium [&_svg]:size-[1cqw]',
                inverted ? 'bg-white/15 text-white' : 'bg-(--brand-soft) text-(--brand)',
              )}
            >
              <Lock />
              {note}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const privacyIcons = [Fingerprint, Clock, NotebookPen, Trash2]

function PrivacySlide() {
  return (
    <Slide eyebrow={copy.privacy.eyebrow} title={copy.privacy.title}>
      <ul className="my-auto grid grid-cols-4 gap-[1.6cqw]">
        {copy.privacy.points.map((point, index) => {
          const Icon = privacyIcons[index] ?? BadgeCheck

          return (
            <li key={point.title} className="rounded-[1.2cqw] bg-muted/60 p-[1.6cqw]">
              <span className="grid size-[3.6cqw] place-items-center rounded-[0.8cqw] bg-(--brand-soft) text-(--brand)">
                <Icon className="size-[1.9cqw]" strokeWidth={1.75} />
              </span>
              <p className="mt-[1.6cqw] text-[1.5cqw] leading-tight font-semibold">{point.title}</p>
              <p className="mt-[0.6cqw] text-[1.2cqw] leading-snug text-muted-foreground">
                {point.description}
              </p>
            </li>
          )
        })}
      </ul>
    </Slide>
  )
}

function DemoSlide() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-(--brand) text-white">
      <div className="flex items-center gap-[2.4cqw]">
        <span aria-hidden className="relative flex size-[2.4cqw]">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />
          <span className="relative size-full rounded-full bg-white" />
        </span>
        <h2 className="text-[9cqw] leading-none font-semibold tracking-tight">{copy.demo.title}</h2>
      </div>
      <p className="mt-[2.6cqw] text-[2.2cqw] text-white/80">{copy.demo.hint}</p>
    </div>
  )
}

function HiringSlide() {
  return (
    <div className="relative isolate grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-[6cqw] px-[8cqw] pb-[3cqw]">
      <Glow />
      <div>
        <p className="text-[1.4cqw] font-semibold tracking-[0.12em] text-(--brand) uppercase">
          {copy.hiring.eyebrow}
        </p>
        <h2 className="mt-[1.6cqw] text-[6cqw] leading-[1.02] font-semibold tracking-tight text-balance">
          {copy.hiring.jobTitle}
        </h2>
        <p className="mt-[2.4cqw] max-w-[36cqw] text-[2cqw] leading-snug text-muted-foreground">
          {copy.hiring.tagline}
        </p>
      </div>
      <HiringQr />
    </div>
  )
}

function ThanksSlide() {
  return (
    <div className="relative isolate flex h-full flex-col items-center justify-center text-center">
      <Glow />
      <h2 className="text-[8cqw] leading-none font-semibold tracking-tight">{copy.thanks.title}</h2>
      <p className="mt-[2.4cqw] text-[3cqw] text-(--brand)">{copy.thanks.subtitle}</p>
    </div>
  )
}
