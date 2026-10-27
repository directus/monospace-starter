import type { FilterDraft, FilterDraftStep, FilterOperatorArity } from '@/components/filters/types'

export type FilterDraftAction<V = unknown> =
  | { type: 'openCreate' }
  | {
      type: 'openAmend'
      ruleId: string
      step: FilterDraftStep
      path: string[]
      operator: string | null
      value: V | undefined
    }
  | { type: 'close' }
  | { type: 'setQuery'; query: string }
  | {
      type: 'selectField'
      path: string[]
      defaultOperator: string | null
    }
  | {
      type: 'selectOperator'
      operator: string
      arity: FilterOperatorArity

      value: V | undefined
    }
  | { type: 'setValue'; value: V | undefined }
  | { type: 'commit'; value?: V }
  | { type: 'back' }
  | { type: 'goto'; step: FilterDraftStep }

function createFilterDraft<V = unknown>(): FilterDraft<V> {
  return {
    step: 'field',
    status: 'editing',
    ruleId: null,
    path: [],
    operator: null,
    value: undefined,
    query: '',
  }
}

function previousStep(step: FilterDraftStep): FilterDraftStep | null {
  if (step === 'value') return 'operator'

  if (step === 'operator') return 'field'

  return null
}

export function filterDraftReducer<V = unknown>(
  state: FilterDraft<V> | null,
  action: FilterDraftAction<V>,
): FilterDraft<V> | null {
  switch (action.type) {
    case 'openCreate':
      return createFilterDraft<V>()

    case 'openAmend':
      return {
        step: action.step,
        status: 'editing',
        ruleId: action.ruleId,
        path: action.path,
        operator: action.operator,
        value: action.value,
        query: '',
      }

    case 'close':
      return null

    case 'setQuery':
      if (!state) return state

      if (state.query === action.query) return state

      return { ...state, query: action.query }

    case 'selectField': {
      if (!state) return state

      // Choosing a field COMMITS at once; the condition is picked on the chip,
      // so the popover never holds a second and third step to walk.
      return {
        ...state,
        path: action.path,
        operator: action.defaultOperator,
        status: 'ready',
        // A field change invalidates the value: "Active" means nothing once
        // the field becomes "Created at".
        value: undefined,
        step: 'operator',
        query: '',
      }
    }

    case 'selectOperator': {
      if (!state) return state

      // arity "none" is the whole filter; a value step would be an empty panel.
      if (action.arity === 'none') {
        return {
          ...state,
          operator: action.operator,
          value: undefined,
          status: 'ready',
          query: '',
        }
      }

      return {
        ...state,
        operator: action.operator,
        value: action.value,
        step: 'value',
        status: 'editing',
        query: '',
      }
    }

    case 'setValue':
      if (!state) return state

      return { ...state, value: action.value }

    case 'commit':
      if (!state) return state

      return {
        ...state,
        value: action.value === undefined ? state.value : action.value,
        status: 'ready',
      }

    case 'back': {
      if (!state) return state
      const step = previousStep(state.step)

      if (!step) return null

      return { ...state, step, status: 'editing', query: '' }
    }

    case 'goto':
      if (!state) return state

      if (state.step === action.step) return state

      return { ...state, step: action.step, status: 'editing', query: '' }

    default:
      return state
  }
}

export function isFilterDraftCommittable<V>(draft: FilterDraft<V> | null): draft is FilterDraft<V> {
  return Boolean(draft && draft.path.length > 0)
}
