import { useQuery } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import { useRef, useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import { requiredText } from '@/components/form/validators'
import { RelativeTime } from '@/components/relative-time'
import { appCopy } from '@/lib/app.copy'
import { errorMessage } from '@/lib/errors'
import { emailTemplatesQuery, type EmailTemplate } from '@/modules/ats/data/home'
import { useSettingsMutations } from '@/modules/ats/mutations/home'
import { AtsSettingsEditor, AtsSettingsList } from '@/modules/ats/settings/ats-settings-list'
import { atsSettingsCopy } from '@/modules/ats/settings/settings.copy'

const copy = atsSettingsCopy.emailTemplates

// The values the senders fill in (candidate profile, interview scheduling). Unknown ones stay
// as typed, so the list is a guide, not a limit.
const placeholders = [
  'candidate_first_name',
  'candidate_name',
  'job_title',
  'recruiter_name',
  'interview_title',
  'interview_date',
  'interview_time',
  'meeting_url',
  'interviewer_names',
  'interviewer_first_name',
  'candidate_url',
]

export function EmailTemplatesSettings() {
  const templates = useQuery(emailTemplatesQuery())
  const { save, remove } = useSettingsMutations('emailTemplates', copy.noun)

  return (
    <AtsSettingsList
      texts={copy}
      icon={Mail}
      query={templates}
      remove={remove}
      renderRow={(row) => (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{row.subject}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
            {copy.updated} <RelativeTime value={row.updatedAt} />
          </span>
        </>
      )}
      renderEditor={(row, close) => (
        <TemplateEditor
          template={row}
          onClose={close}
          onSave={(data) =>
            save.mutateAsync({ collection: 'emailTemplates', id: row?.id, data }).then(close)
          }
        />
      )}
    />
  )
}

type Target = 'subject' | 'body'

function TemplateEditor({
  template,
  onClose,
  onSave,
}: {
  template?: EmailTemplate
  onClose: () => void
  onSave: (data: { name: string; subject: string; body: string }) => Promise<void>
}) {
  const [error, setError] = useState<string>()
  // Where the caret was last, so a placeholder lands there rather than at the end of the body.
  const caret = useRef<{ target: Target; start: number; end: number }>(undefined)

  const form = useAppForm({
    defaultValues: {
      name: template?.name ?? '',
      subject: template?.subject ?? '',
      body: template?.body ?? '',
    },
    onSubmit: async ({ value }) => {
      setError(undefined)

      try {
        await onSave({ name: value.name.trim(), subject: value.subject.trim(), body: value.body })
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
  })

  const track =
    (target: Target) => (event: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
      const { selectionStart, selectionEnd } = event.currentTarget

      caret.current = { target, start: selectionStart ?? 0, end: selectionEnd ?? 0 }
    }

  const insert = (name: string) => {
    const token = `{{${name}}}`
    const target = caret.current?.target ?? 'body'
    const current = form.getFieldValue(target)
    const start = caret.current?.start ?? current.length
    const end = caret.current?.end ?? current.length
    const next = current.slice(0, start) + token + current.slice(end)
    const at = start + token.length

    form.setFieldValue(target, next)
    caret.current = { target, start: at, end: at }
    requestAnimationFrame(() => {
      const element = document.getElementById(`field-${target}`)

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.focus()
        element.setSelectionRange(at, at)
      }
    })
  }

  return (
    <AtsSettingsEditor
      wide
      title={template ? copy.edit : copy.add}
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      error={error}
      submit={
        <form.AppForm>
          <form.SubmitButton
            label={template ? appCopy.form.save : copy.add}
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
      <form.AppField
        name="subject"
        validators={{ onBlur: requiredText(copy.subject), onSubmit: requiredText(copy.subject) }}
      >
        {(field) => (
          <field.TextField
            label={copy.subject}
            maxLength={240}
            onSelect={track('subject')}
            onFocus={track('subject')}
          />
        )}
      </form.AppField>
      <form.AppField
        name="body"
        validators={{ onBlur: requiredText(copy.body), onSubmit: requiredText(copy.body) }}
      >
        {(field) => (
          <field.TextareaField
            label={copy.body}
            rows={10}
            className="[&_textarea]:font-mono [&_textarea]:text-[13px]"
            onSelect={track('body')}
            onFocus={track('body')}
          />
        )}
      </form.AppField>
      <div className="space-y-2 rounded-lg bg-muted/50 p-3">
        <div>
          <p className="text-sm font-medium">{copy.placeholders}</p>
          <p className="text-xs text-muted-foreground">{copy.placeholdersHint}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {placeholders.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={copy.insert(name)}
              // Keep the caret where it is; a click would blur the field first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(name)}
              className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:py-1.5"
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      </div>
    </AtsSettingsEditor>
  )
}
