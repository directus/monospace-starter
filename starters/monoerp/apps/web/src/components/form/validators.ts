import { z } from 'zod'

import { appCopy } from '@/lib/app.copy'
import type { RelationOption } from '@/components/form/relation-combobox'

export const requiredText = (label: string) =>
  z.string().trim().min(1, appCopy.form.required(label))

export const requiredEmail = (label: string) =>
  z.string().trim().min(1, appCopy.form.required(label)).email(appCopy.form.invalidEmail)

// Loose on purpose: digits with the usual separators, extensions and country codes included.
export const optionalPhone = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^\+?[\d\s().-]{6,24}(?:\s*(?:x|ext\.?)\s*\d{1,6})?$/i, appCopy.form.invalidPhone)
    .refine((value) => value.replace(/\D/g, '').length >= 7, appCopy.form.invalidPhone),
])

export const optionalDomain = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^(?!-)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}$/i, appCopy.form.invalidDomain),
])

export const optionalAmount = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .regex(/^\d{1,15}(\.\d{1,2})?$/, appCopy.form.invalidAmount),
])

export const requiredRelation = (label: string) =>
  z
    .custom<RelationOption | null>()
    .refine((option) => option !== null, appCopy.form.required(label))
