import { useQuery } from '@tanstack/react-query'
import { Layers } from 'lucide-react'
import { useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import { requiredText } from '@/components/form/validators'
import { Badge } from '@/components/ui/badge'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { jobLevelsQuery, type JobLevel } from '@/modules/ats/data/shared'
import { nextPosition, useSettingsMutations } from '@/modules/ats/mutations/home'
import { AtsSettingsEditor, AtsSettingsList } from '@/modules/ats/settings/ats-settings-list'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

const copy = atsSettingsCopy.jobLevels

const trackOptions = Object.entries(copy.tracks).map(([value, label]) => ({ value, label }))

const trackTone = new Map([
  ['individual', 'bg-sky-500/10 text-sky-700 dark:text-sky-400'],
  ['manager', 'bg-violet-500/10 text-violet-700 dark:text-violet-400'],
  ['executive', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
])

function trackLabel(track: string | null) {
  const labels: Record<string, string> = copy.tracks

  return labels[track ?? ''] ?? track ?? ''
}

export function JobLevelsSettings() {
  const levels = useQuery(jobLevelsQuery())
  const { save, remove, reorder } = useSettingsMutations('jobLevels', copy.noun)

  return (
    <AtsSettingsList
      texts={copy}
      icon={Layers}
      query={levels}
      remove={remove}
      reorder={reorder}
      renderRow={(row) => (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
          <Badge variant="secondary" className={cn('font-normal', trackTone.get(row.track ?? ''))}>
            {trackLabel(row.track)}
          </Badge>
        </>
      )}
      renderEditor={(row, close) => (
        <JobLevelEditor
          level={row}
          onClose={close}
          onSave={(data) =>
            save
              .mutateAsync({
                collection: 'jobLevels',
                id: row?.id,
                data: { ...data, position: row?.position ?? nextPosition(levels.data ?? []) },
              })
              .then(close)
          }
        />
      )}
    />
  )
}

function JobLevelEditor({
  level,
  onClose,
  onSave,
}: {
  level?: JobLevel
  onClose: () => void
  onSave: (data: { name: string; track: string }) => Promise<void>
}) {
  const [error, setError] = useState<string>()

  const form = useAppForm({
    defaultValues: { name: level?.name ?? '', track: level?.track ?? 'individual' },
    onSubmit: async ({ value }) => {
      setError(undefined)

      try {
        await onSave({ name: value.name.trim(), track: value.track })
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
  })

  return (
    <AtsSettingsEditor
      title={level ? copy.edit : copy.add}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      error={error}
      submit={
        <form.AppForm>
          <form.SubmitButton
            label={level ? appCopy.form.save : copy.add}
            pendingLabel={appCopy.form.saving}
          />
        </form.AppForm>
      }
    >
      <form.AppField
        name="name"
        validators={{ onBlur: requiredText(copy.name), onSubmit: requiredText(copy.name) }}
      >
        {(field) => (
          <field.TextField
            label={copy.name}
            placeholder={copy.namePlaceholder}
            maxLength={80}
            autoFocus
          />
        )}
      </form.AppField>
      <form.AppField name="track">
        {(field) => <field.SelectField label={copy.track} options={trackOptions} />}
      </form.AppField>
    </AtsSettingsEditor>
  )
}
