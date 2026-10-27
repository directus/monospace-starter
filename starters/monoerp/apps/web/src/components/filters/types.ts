import type { appCopy } from '@/lib/app.copy'
// Title: Filters
// Description: Stepped filter builder with nested fields, popover value editors and a boolean query tree.

import type * as React from 'react'

export interface FilterRule<V = unknown> {
  id: string
  type: 'rule'

  path: string[]
  operator: string
  value: V | undefined

  negated?: boolean
}

export interface FilterQuery<V = unknown> {
  rules: FilterRule<V>[]
}

type FilterChangeReason = 'add' | 'update' | 'remove' | 'duplicate' | 'negate' | 'clear'

export interface FilterChangeDetails<V = unknown, O = unknown> {
  reason: FilterChangeReason

  rule: FilterRule<V> | null

  field: FilterField<V, O> | null
}

export type FilterOperatorArity = 'none' | 'one' | 'many' | 'range'

type FilterClauseOperator =
  | '_eq'
  | '_neq'
  | '_in'
  | '_nin'
  | '_icontains'
  | '_nicontains'
  | '_starts_with'
  | '_ends_with'
  | '_gt'
  | '_gte'
  | '_lt'
  | '_lte'
  | '_between'
  | '_nbetween'
  | '_null'

export interface FilterOperator {
  value: string
  label: string

  arity?: FilterOperatorArity

  clause: FilterClauseOperator

  clauseValue?: boolean

  inverse?: string

  hidden?: boolean
}

export type FilterValueType = 'text' | 'number' | 'select'

export interface FilterOption<O = unknown> {
  value: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]
  disabled?: boolean

  exclusive?: boolean

  data?: O
}

interface FilterLoadContext {
  signal: AbortSignal
  cursor?: string
}

export interface FilterLoadResult<O = unknown> {
  items: FilterOption<O>[]
  nextCursor?: string

  hasMore?: boolean
}

export interface FilterField<V = unknown, O = unknown> {
  id: string
  label: string
  icon?: React.ReactNode
  description?: string
  keywords?: string[]

  disabled?: boolean

  type?: FilterValueType
  options?: FilterOption<O>[]

  loadOptions?: (
    query: string,
    context: FilterLoadContext,
  ) => FilterOption<O>[] | Promise<FilterOption<O>[] | FilterLoadResult<O>>

  resolveValues?: (values: string[]) => FilterOption<O>[] | Promise<FilterOption<O>[]>

  operators?: FilterOperator[]
  defaultOperator?: string

  editor?: FilterEditorRef<V, O>
  renderValue?: (context: FilterValueDisplayContext<V, O>) => React.ReactNode

  valueText?: (context: FilterValueDisplayContext<V, O>) => string

  placeholder?: string

  searchable?: boolean

  pinSelected?: boolean

  sortSelected?: 'none' | 'label' | 'snapshot'

  className?: string

  data?: unknown
}

type FilterEditorHost = 'create' | 'amend'

export interface FilterOptionsState<O = unknown> {
  items: readonly FilterOption<O>[]
  loading: boolean
  error: boolean
  hasMore: boolean

  query: string
  setQuery: (query: string) => void
  loadMore: () => void
  retry: () => void

  resolve: (value: string) => FilterOption<O> | undefined
}

interface FilterCommitOptions {
  close?: boolean
}

export interface FilterEditorProps<V = unknown, O = unknown> {
  field: FilterField<V, O>
  operator: FilterOperator

  value: V | undefined
  onValueChange: (value: V | undefined) => void
  host: FilterEditorHost

  autoFocusProps: {
    ref: React.RefCallback<HTMLElement>
    autoFocus: boolean
  }

  commit: (value?: V, options?: FilterCommitOptions) => void
  cancel: () => void

  back: () => void
  options: FilterOptionsState<O>
  labels: FilterLabels
}

export type FilterEditor<V = unknown, O = unknown> = React.ComponentType<FilterEditorProps<V, O>>

export type AnyFilterEditor = React.ComponentType<FilterEditorProps<unknown, unknown>>

export type FilterEditorRegistry = Record<string, AnyFilterEditor>

type FilterEditorRef<V = unknown, O = unknown> =
  | FilterEditor<V, O>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | FilterEditor<any, any>

export interface FilterValueDisplayContext<V = unknown, O = unknown> {
  value: V | undefined

  values: unknown[]
  field: FilterField<V, O>
  operator: FilterOperator

  options: FilterOption<O>[]
  labels: FilterLabels
}

export interface FilterIndex<V = unknown, O = unknown> {
  byPath: Map<string, FilterField<V, O>>

  all: { field: FilterField<V, O>; path: string[] }[]

  roots: FilterField<V, O>[]

  signature: string
}

export type FilterDraftStep = 'field' | 'operator' | 'value'

export interface FilterDraft<V = unknown> {
  step: FilterDraftStep

  status: 'editing' | 'ready'

  ruleId: string | null

  path: string[]
  operator: string | null
  value: V | undefined
  query: string
}

export type FilterLabels = typeof appCopy.filters
