import { useAppForm, submitForm } from '@/components/form/app-form'
import type { SelectOption } from '@/components/form/fields'
import {
  DrawerForm,
  DrawerFormBody,
  DrawerFormFooter,
  FormDrawer,
} from '@/components/form/form-drawer'
import type { RelationOption } from '@/components/form/relation-combobox'
import { appCopy } from '@/lib/app.copy'
import { fromDateTimeInput } from '@/lib/dates'

// One field the bulk editor can set. Every field starts as "leave unchanged"; only the ones the
// user touches end up in the patch.
export type BulkField =
  | { name: string; label: string; kind: 'select'; options: ReadonlyArray<SelectOption> }
  | { name: string; label: string; kind: 'date' }
  | {
      name: string
      label: string
      kind: 'relation'
      search: (q: string) => Promise<Array<RelationOption>>
      placeholder: string
      searchPlaceholder?: string
    }

const UNCHANGED = ''

export function BulkEditDrawer({
  open,
  onOpenChange,
  count,
  noun,
  singular,
  fields,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  noun: string
  singular: string
  fields: Array<BulkField>
  // Receives only the fields that were set: `{ status: 'active', ownerUserId: '…' }`.
  onApply: (patch: Record<string, string | null>) => Promise<void>
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={appCopy.bulk.editTitle(count, noun, singular)}
      description={appCopy.bulk.editDescription}
    >
      {open ? (
        <BulkEditForm fields={fields} onApply={onApply} onCancel={() => onOpenChange(false)} />
      ) : null}
    </FormDrawer>
  )
}

function BulkEditForm({
  fields,
  onApply,
  onCancel,
}: {
  fields: Array<BulkField>
  onApply: (patch: Record<string, string | null>) => Promise<void>
  onCancel: () => void
}) {
  const relations: Record<string, RelationOption | null> = Object.fromEntries(
    fields.map((field) => [field.name, null]),
  )

  const defaultValues = {
    values: Object.fromEntries(fields.map((field) => [field.name, UNCHANGED])),
    relations,
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: ({ value, formApi }) =>
      submitForm(formApi, async () => {
        const patch: Record<string, string | null> = {}

        for (const field of fields) {
          const current = value.values[field.name]
          const option = value.relations[field.name]

          if (field.kind === 'select' && current !== undefined && current !== UNCHANGED) {
            patch[field.name] = current
          }

          if (field.kind === 'date' && current) {
            patch[field.name] = fromDateTimeInput(current)
          }

          if (field.kind === 'relation' && option) {
            patch[field.name] = option.value
          }
        }

        if (!Object.keys(patch).length) {
          onCancel()

          return
        }

        await onApply(patch)
        onCancel()
      }),
  })

  return (
    <DrawerForm form={form}>
      <DrawerFormBody>
        {fields.map((field) =>
          field.kind === 'select' ? (
            <form.AppField key={field.name} name={`values.${field.name}`}>
              {(control) => (
                <control.SelectField
                  label={field.label}
                  options={[{ value: UNCHANGED, label: appCopy.bulk.unchanged }, ...field.options]}
                />
              )}
            </form.AppField>
          ) : field.kind === 'date' ? (
            <form.AppField key={field.name} name={`values.${field.name}`}>
              {(control) => (
                <control.TextField label={field.label} optional type="datetime-local" />
              )}
            </form.AppField>
          ) : (
            <form.AppField key={field.name} name={`relations.${field.name}`}>
              {(control) => (
                <control.RelationField
                  label={field.label}
                  optional
                  search={field.search}
                  placeholder={field.placeholder}
                  searchPlaceholder={field.searchPlaceholder}
                />
              )}
            </form.AppField>
          ),
        )}
      </DrawerFormBody>
      <DrawerFormFooter
        error={
          <form.AppForm>
            <form.FormError />
          </form.AppForm>
        }
        onCancel={onCancel}
      >
        <form.AppForm>
          <form.SubmitButton label={appCopy.bulk.apply} pendingLabel={appCopy.bulk.applying} />
        </form.AppForm>
      </DrawerFormFooter>
    </DrawerForm>
  )
}
