import { X } from 'lucide-react'
import { useCallback } from 'react'

import { RelationCombobox } from '@/components/form/relation-combobox'
import type { RelationOption } from '@/components/form/relation-combobox'
import { UserAvatar, userFromOption } from '@/components/users'
import { lookupUsers } from '@/lib/users'
import { atsCopy } from '@/modules/ats/ats.copy'

const copy = atsCopy.interviews.schedule

// Chips for the people picked, and a search box that adds one more.
export function InterviewerPicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string
  value: Array<RelationOption>
  onChange: (next: Array<RelationOption>) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy?: string
}) {
  const picked = value.map((option) => option.value).join(',')

  const search = useCallback(
    async (q: string) => {
      const chosen = new Set(picked.split(','))

      return (await lookupUsers(q)).filter((option) => !chosen.has(option.value))
    },
    [picked],
  )

  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((option) => (
            <li
              key={option.value}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background pr-1 pl-0.5 text-sm"
            >
              <UserAvatar user={userFromOption(option)} size="sm" className="size-6" />
              <span className="max-w-40 truncate">{option.label}</span>
              <button
                type="button"
                aria-label={copy.removeInterviewer(option.label)}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => onChange(value.filter((item) => item.value !== option.value))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <RelationCombobox
        id={id}
        value={null}
        onChange={(option) => {
          if (option) onChange([...value, option])
        }}
        onBlur={onBlur}
        search={search}
        searchKey={picked}
        placeholder={copy.addInterviewer}
        searchPlaceholder={copy.searchPeople}
        clearable={false}
        invalid={invalid}
        describedBy={describedBy}
      />
    </div>
  )
}
