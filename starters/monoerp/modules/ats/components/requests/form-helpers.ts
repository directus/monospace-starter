import { z } from 'zod'

import { appCopy } from '@/lib/app.copy'
import { uuidSchema } from '@/lib/uuid'
import { atsCopy } from '@/modules/ats/ats.copy'
import type { AtsOption } from '@/modules/ats/ats.copy'

// The spec's currency list for compensation and budgets.
export const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR'] as const

export const currencyOptions = CURRENCIES.map((code) => ({ value: code, label: code }))

export function optionsFor<K extends AtsOption>(kind: K, exclude: ReadonlyArray<string> = []) {
  const labels: Record<string, string> = atsCopy.options[kind]

  return Object.entries(labels)
    .filter(([value]) => !exclude.includes(value))
    .map(([value, label]) => ({ value, label }))
}

export const wholeNumber = ({ min = 0, max }: { min?: number; max?: number } = {}) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, atsCopy.requests.plan.form.invalidCount)
    .refine((value) => Number(value) >= min && (max === undefined || Number(value) <= max), {
      message:
        max === undefined
          ? atsCopy.requests.plan.form.invalidCount
          : atsCopy.requests.requests.form.hiresRange(max),
    })

export const optionalWholeNumber = z.union([z.literal(''), wholeNumber()])

export const requiredAmount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, appCopy.form.required(label))
    .pipe(z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, appCopy.form.invalidAmount))

export const amountOrNull = (value: string) => value.trim() || null

export const countOrNull = (value: string) => (value.trim() ? Number(value) : null)

export const textOrNull = (value: string) => value.trim() || null

// Select fields hold ids as plain strings; parse them back on the way out.
export const toUuid = (value: string) => uuidSchema.parse(value)

export const toUuidOrNull = (value: string) => (value ? uuidSchema.parse(value) : null)
