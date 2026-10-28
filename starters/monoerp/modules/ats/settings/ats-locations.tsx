import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import { requiredText } from '@/components/form/validators'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { hiringLocationsQuery, type HiringLocation } from '@/modules/ats/data/shared'
import { nextPosition, useSettingsMutations } from '@/modules/ats/mutations/home'
import { AtsSettingsEditor, AtsSettingsList } from '@/modules/ats/settings/ats-settings-list'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

const copy = atsSettingsCopy.hiringLocations

export function HiringLocationsSettings() {
  const locations = useQuery(hiringLocationsQuery())
  const { save, remove, reorder } = useSettingsMutations('hiringLocations', copy.noun)

  return (
    <AtsSettingsList
      texts={copy}
      icon={MapPin}
      query={locations}
      remove={remove}
      reorder={reorder}
      renderRow={(row) => (
        <>
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
        </>
      )}
      renderEditor={(row, close) => (
        <LocationEditor
          location={row}
          onClose={close}
          onSave={(name) =>
            save
              .mutateAsync({
                collection: 'hiringLocations',
                id: row?.id,
                data: { name, position: row?.position ?? nextPosition(locations.data ?? []) },
              })
              .then(close)
          }
        />
      )}
    />
  )
}

function LocationEditor({
  location,
  onClose,
  onSave,
}: {
  location?: HiringLocation
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [error, setError] = useState<string>()

  const form = useAppForm({
    defaultValues: { name: location?.name ?? '' },
    onSubmit: async ({ value }) => {
      setError(undefined)

      try {
        await onSave(value.name.trim())
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
  })

  return (
    <AtsSettingsEditor
      title={location ? copy.edit : copy.add}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      error={error}
      submit={
        <form.AppForm>
          <form.SubmitButton
            label={location ? appCopy.form.save : copy.add}
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
            maxLength={120}
            autoFocus
          />
        )}
      </form.AppField>
    </AtsSettingsEditor>
  )
}
