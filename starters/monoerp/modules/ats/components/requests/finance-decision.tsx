import { Check, CornerUpLeft, X } from 'lucide-react'
import { useState } from 'react'

import { useAppForm } from '@/components/form/app-form'
import { optionalAmount } from '@/components/form/validators'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { Uuid } from '@/generated/monospace'
import { appCopy } from '@/lib/app.copy'
import { useCurrentUser } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { atsCopy } from '@/modules/ats/ats.copy'
import {
  amountOrNull,
  countOrNull,
  currencyOptions,
  optionalWholeNumber,
  requiredAmount,
} from '@/modules/ats/components/requests/form-helpers'
import { useFinanceDecision } from '@/modules/ats/mutations/requests'
import type { Decision } from '@/modules/ats/mutations/requests'

const copy = atsCopy.requests.finance

const DECISIONS = [
  { value: 'approved', label: copy.approve, icon: Check },
  { value: 'declined', label: copy.decline, icon: X },
  { value: 'returned', label: atsCopy.requests.approvals.return, icon: CornerUpLeft },
] as const

const isDecision = (value: unknown): value is Decision =>
  DECISIONS.some((decision) => decision.value === value)

export type FinanceSubject = {
  id: Uuid
  compMin?: string | null
  compMax?: string | null
  currency?: string | null
  hasVariableComp: boolean
  pendingApprovalId: Uuid | null
}

type FinanceValues = {
  decision: Decision
  baseMin: string
  baseMax: string
  variableMin: string
  variableMax: string
  currency: string
  equity: string
  note: string
}

function sumRange(base: string, variable: string) {
  if (!base) return null

  return String(Number(base) + (variable && /^\d/.test(variable) ? Number(variable) : 0))
}

// Approve needs the approved budget (variable only where the department pays one); decline needs
// a rationale; return needs a note telling the requester what's missing.
export function FinanceDecisionForm({
  subject,
  initialDecision = 'approved',
  onDone,
  onCancel,
}: {
  subject: FinanceSubject
  initialDecision?: Decision
  onDone?: () => void
  onCancel?: () => void
}) {
  const currentUser = useCurrentUser()
  const decide = useFinanceDecision()
  const [submitError, setSubmitError] = useState<string>()

  const defaultValues: FinanceValues = {
    decision: initialDecision,
    baseMin: subject.compMin ?? '',
    baseMax: subject.compMax ?? '',
    variableMin: '',
    variableMax: '',
    currency: subject.currency ?? 'USD',
    equity: '',
    note: '',
  }

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      const approved = value.decision === 'approved'

      try {
        await decide.mutateAsync({
          requestId: subject.id,
          approvalId: subject.pendingApprovalId,
          decision: value.decision,
          note: value.note.trim() || null,
          userId: currentUser?.id ?? null,
          budget: approved
            ? {
                approvedBaseMin: value.baseMin.trim(),
                approvedBaseMax: value.baseMax.trim(),
                approvedVariableMin: subject.hasVariableComp
                  ? amountOrNull(value.variableMin)
                  : null,
                approvedVariableMax: subject.hasVariableComp
                  ? amountOrNull(value.variableMax)
                  : null,
                approvedCurrency: value.currency,
                approvedEquityUnits: countOrNull(value.equity),
              }
            : undefined,
        })
        onDone?.()
      } catch (error) {
        setSubmitError(errorMessage(error))
      }
    },
  })

  const whenApproving =
    (check: (value: string, values: typeof form.state.values) => string | undefined) =>
    ({ value }: { value: string }) => {
      const values = form.state.values

      if (values.decision !== 'approved') return undefined
      const message = check(value, values)

      return message ? { message } : undefined
    }

  const amount = (label: string) =>
    whenApproving((value) => requiredAmount(label).safeParse(value).error?.issues[0]?.message)

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="decision">
        {(field) => (
          <div className="space-y-2">
            <Label id="finance-decision-label">{copy.decision}</Label>
            <RadioGroup
              name={field.name}
              value={field.state.value}
              onValueChange={(value) => {
                if (isDecision(value)) field.handleChange(value)
              }}
              aria-labelledby="finance-decision-label"
              className="grid-cols-3"
            >
              {DECISIONS.map((decision) => (
                <RadioGroupItem
                  key={decision.value}
                  value={decision.value}
                  className="h-9 gap-1.5 px-2 text-xs sm:text-sm"
                >
                  <decision.icon className="size-4 shrink-0" />
                  <span className="truncate">{decision.label}</span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.decision}>
        {(decision) =>
          decision === 'approved' ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {copy.approvedBudget}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <form.AppField
                  name="baseMin"
                  validators={{ onSubmit: amount(copy.baseMin), onBlur: amount(copy.baseMin) }}
                >
                  {(field) => <field.TextField label={copy.baseMin} inputMode="decimal" />}
                </form.AppField>
                <form.AppField
                  name="baseMax"
                  validators={{
                    onBlur: amount(copy.baseMax),
                    onSubmit: whenApproving((value, values) => {
                      const invalid = requiredAmount(copy.baseMax).safeParse(value).error?.issues[0]
                        ?.message

                      if (invalid) return invalid

                      return Number(value) < Number(values.baseMin)
                        ? atsCopy.requests.requests.form.compOrder
                        : undefined
                    }),
                  }}
                >
                  {(field) => <field.TextField label={copy.baseMax} inputMode="decimal" />}
                </form.AppField>
                {subject.hasVariableComp ? (
                  <>
                    <form.AppField
                      name="variableMin"
                      validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
                    >
                      {(field) => (
                        <field.TextField label={copy.variableMin} inputMode="decimal" optional />
                      )}
                    </form.AppField>
                    <form.AppField
                      name="variableMax"
                      validators={{ onBlur: optionalAmount, onSubmit: optionalAmount }}
                    >
                      {(field) => (
                        <field.TextField label={copy.variableMax} inputMode="decimal" optional />
                      )}
                    </form.AppField>
                  </>
                ) : null}
                <form.AppField name="currency">
                  {(field) => <field.SelectField label={copy.currency} options={currencyOptions} />}
                </form.AppField>
                <form.AppField
                  name="equity"
                  validators={{ onBlur: optionalWholeNumber, onSubmit: optionalWholeNumber }}
                >
                  {(field) => <field.TextField label={copy.equity} inputMode="numeric" optional />}
                </form.AppField>
              </div>
              <form.Subscribe selector={(state) => state.values}>
                {(values) => {
                  const from = sumRange(values.baseMin, values.variableMin)
                  const to = sumRange(values.baseMax, values.variableMax)

                  return from && to ? (
                    <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{copy.total}</span>
                      <span className="font-medium tabular-nums">
                        {copy.range(
                          formatMoney(from, values.currency),
                          formatMoney(to, values.currency),
                        )}
                      </span>
                    </div>
                  ) : null
                }}
              </form.Subscribe>
            </div>
          ) : null
        }
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values.decision}>
        {(decision) => (
          <form.AppField
            name="note"
            validators={{
              onSubmit: ({ value }) =>
                form.state.values.decision !== 'approved' && !value.trim()
                  ? { message: atsCopy.requests.approvals.noteRequired }
                  : undefined,
            }}
          >
            {(field) => (
              <field.TextareaField
                label={
                  decision === 'declined'
                    ? copy.rationale
                    : decision === 'returned'
                      ? copy.returnNote
                      : copy.notes
                }
                optional={decision === 'approved'}
                rows={3}
              />
            )}
          </form.AppField>
        )}
      </form.Subscribe>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 max-md:[&>*]:flex-1">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {appCopy.common.cancel}
          </Button>
        ) : null}
        <form.Subscribe selector={(state) => [state.values.decision, state.isSubmitting] as const}>
          {([decision, submitting]) => (
            <Button
              type="submit"
              variant={decision === 'declined' ? 'destructive' : 'default'}
              disabled={submitting}
            >
              {submitting
                ? copy.saving
                : decision === 'approved'
                  ? copy.confirmApprove
                  : decision === 'declined'
                    ? copy.confirmDecline
                    : copy.confirmReturn}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
