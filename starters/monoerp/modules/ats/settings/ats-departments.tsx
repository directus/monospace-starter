import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useState } from 'react'

import { EntityAvatar } from '@/components/avatars'
import { useAppForm } from '@/components/form/app-form'
import { requiredText } from '@/components/form/validators'
import { Badge } from '@/components/ui/badge'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { usersById } from '@/lib/monospace-system'
import { avatarUrl, ownerLabel, ownerOption } from '@/lib/users'
import { lookupUsers } from '@/lib/users'
import { uuidSchema } from '@/lib/uuid'
import { departmentsQuery, type Department } from '@/modules/ats/data/shared'
import { useSettingsMutations } from '@/modules/ats/mutations/home'
import { AtsSettingsEditor, AtsSettingsList } from '@/modules/ats/settings/ats-settings-list'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

const copy = atsSettingsCopy.departments

export function DepartmentsSettings() {
  const departments = useQuery(departmentsQuery())
  const { save, remove } = useSettingsMutations('departments', copy.noun)
  const headIds = (departments.data ?? []).map((row) => row.headUserId)

  const heads = useQuery({
    queryKey: ['departments', 'heads', headIds],
    queryFn: () => usersById(headIds),
    enabled: departments.isSuccess,
  })

  const headOf = (row: Department) => (row.headUserId && heads.data?.get(row.headUserId)) || null

  return (
    <AtsSettingsList
      texts={copy}
      icon={Building2}
      query={departments}
      remove={remove}
      renderRow={(row) => {
        const head = headOf(row)

        return (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.name}</span>
            {row.hasVariableComp ? (
              <Badge variant="secondary" className="font-normal max-sm:hidden">
                {copy.variableCompBadge}
              </Badge>
            ) : null}
            <span className="flex w-40 shrink-0 items-center gap-2 text-sm text-muted-foreground max-sm:hidden">
              {head ? (
                <>
                  <EntityAvatar
                    label={ownerLabel(head)}
                    image={avatarUrl(head.avatarId)}
                    variant="circle"
                  />
                  <span className="truncate">{ownerLabel(head)}</span>
                </>
              ) : (
                <span className="truncate text-muted-foreground/70">{copy.noHead}</span>
              )}
            </span>
          </>
        )
      }}
      renderEditor={(row, close) => (
        <DepartmentEditor
          department={row}
          head={row ? headOf(row) : null}
          onClose={close}
          onSave={(data) =>
            save.mutateAsync({ collection: 'departments', id: row?.id, data }).then(close)
          }
        />
      )}
    />
  )
}

function DepartmentEditor({
  department,
  head,
  onClose,
  onSave,
}: {
  department?: Department
  head: Parameters<typeof ownerOption>[0]
  onClose: () => void
  onSave: (data: {
    name: string
    headUserId: Uuid | null
    hasVariableComp: boolean
  }) => Promise<void>
}) {
  const [error, setError] = useState<string>()

  const form = useAppForm({
    defaultValues: {
      name: department?.name ?? '',
      head: ownerOption(head),
      hasVariableComp: department?.hasVariableComp ?? false,
    },
    onSubmit: async ({ value }) => {
      setError(undefined)

      try {
        await onSave({
          name: value.name.trim(),
          headUserId: value.head ? uuidSchema.parse(value.head.value) : null,
          hasVariableComp: value.hasVariableComp,
        })
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
  })

  return (
    <AtsSettingsEditor
      title={department ? copy.edit : copy.add}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      error={error}
      submit={
        <form.AppForm>
          <form.SubmitButton
            label={department ? appCopy.form.save : copy.add}
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
      <form.AppField name="head">
        {(field) => (
          <field.RelationField
            label={copy.head}
            optional
            search={lookupUsers}
            placeholder={copy.headPlaceholder}
          />
        )}
      </form.AppField>
      <form.AppField name="hasVariableComp">
        {(field) => <field.CheckboxField label={copy.variableComp} hint={copy.variableCompHint} />}
      </form.AppField>
    </AtsSettingsEditor>
  )
}
