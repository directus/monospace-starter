import { CalendarOff } from 'lucide-react'

import type { RelationOption } from '@/components/form/relation-combobox'
import { Badge } from '@/components/ui/badge'
import { UserAvatar, userFromOption } from '@/components/users'
import { cn } from '@/lib/utils'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.interviews.schedule

const DAY_START = 8

const DAY_END = 18

const HOURS = DAY_END - DAY_START

type Block = { start: number; end: number }

// Stable fake calendars: the same person on the same day always gets the same busy blocks.
function hash(text: string) {
  let value = 2166136261

  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }

  return value >>> 0
}

function sampleBusy(userId: string, date: string): Array<Block> {
  let seed = hash(`${userId}:${date}`)

  const next = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0

    return seed / 4294967296
  }

  const blocks: Array<Block> = []
  const count = 2 + Math.floor(next() * 3)

  for (let index = 0; index < count; index++) {
    const start = DAY_START + Math.floor(next() * (HOURS * 2 - 2)) / 2
    const length = [0.5, 1, 1, 1.5, 2][Math.floor(next() * 5)] ?? 1
    blocks.push({ start, end: Math.min(DAY_END, start + length) })
  }

  return blocks
}

const percent = (hour: number) => `${((hour - DAY_START) / HOURS) * 100}%`

// Each interviewer's day, 8:00 to 18:00, with the proposed slot laid over it. The data is made
// up until Google Calendar is connected, and says so.
export function AvailabilityStrip({
  people,
  date,
  start,
  end,
}: {
  people: Array<RelationOption>
  date: string
  start: Date | null
  end: Date | null
}) {
  const slot =
    start && end
      ? {
          start: start.getHours() + start.getMinutes() / 60,
          end: end.getHours() + end.getMinutes() / 60,
        }
      : null

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{copy.availability}</span>
        <Badge variant="outline" className="text-muted-foreground">
          {copy.availabilitySample}
        </Badge>
      </div>
      {people.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <CalendarOff className="size-4" />
          {copy.noInterviewers}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[7rem_1fr] gap-2 max-sm:grid-cols-[2rem_1fr]">
            <span />
            <div className="relative h-4 text-[10px] text-muted-foreground tabular-nums">
              {Array.from({ length: HOURS / 2 + 1 }, (_, index) => DAY_START + index * 2).map(
                (hour) => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                    style={{ left: percent(hour) }}
                  >
                    {hour > 12 ? hour - 12 : hour}
                    {hour >= 12 ? 'p' : 'a'}
                  </span>
                ),
              )}
            </div>
          </div>
          {people.map((person) => {
            const busy = sampleBusy(person.value, date)

            const clash = slot
              ? busy.some((block) => block.start < slot.end && block.end > slot.start)
              : false

            return (
              <div
                key={person.value}
                className="grid grid-cols-[7rem_1fr] items-center gap-2 max-sm:grid-cols-[2rem_1fr]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <UserAvatar user={userFromOption(person)} size="sm" />
                  <span className="truncate text-xs max-sm:sr-only">{person.label}</span>
                </span>
                <div className="relative h-6 overflow-hidden rounded-md bg-muted/60">
                  {Array.from({ length: HOURS - 1 }, (_, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className="absolute inset-y-0 w-px bg-border/70"
                      style={{ left: percent(DAY_START + index + 1) }}
                    />
                  ))}
                  {busy.map((block, index) => (
                    <span
                      key={index}
                      title={copy.busy}
                      className="absolute inset-y-1 rounded-sm bg-muted-foreground/25"
                      style={{
                        left: percent(block.start),
                        width: percent(DAY_START + block.end - block.start),
                      }}
                    />
                  ))}
                  {slot && slot.end > DAY_START && slot.start < DAY_END ? (
                    <span
                      title={copy.slot}
                      className={cn(
                        'absolute inset-y-0 rounded-sm border-2',
                        clash
                          ? 'border-destructive bg-destructive/15'
                          : 'border-success bg-success/15',
                      )}
                      style={{
                        left: percent(Math.max(DAY_START, slot.start)),
                        width: percent(
                          DAY_START + Math.min(DAY_END, slot.end) - Math.max(DAY_START, slot.start),
                        ),
                      }}
                    />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{copy.availabilityHint}</p>
    </div>
  )
}
