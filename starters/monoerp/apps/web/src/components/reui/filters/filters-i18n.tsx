import type { FilterLabels } from '@/components/reui/filters/filters-types'

/** The English copy. */
export const DEFAULT_FILTER_LABELS: FilterLabels = {
  addFilter: 'Add filter',
  groupAnnouncement: (added) => (added ? 'Group added' : 'Group removed'),
  clearAll: 'Clear all',
  searchFields: 'Search attributes...',
  searchOperators: 'Search operators...',
  searchOptions: 'Search...',
  back: 'Back',
  clear: 'Clear',
  apply: 'Apply',
  discard: 'Discard changes',
  empty: 'No results',
  loading: 'Loading...',
  loadingMore: 'Loading more...',
  loadMore: 'Load more',
  error: 'Could not load',
  retry: 'Retry',
  duplicate: 'Duplicate',
  negate: 'Negate',
  remove: 'Remove',
  chipMenu: (fieldLabel) => `${fieldLabel} filter options`,
  filtersLabel: 'Filters',
  filterLabel: (condition) => condition,
  readOnly: 'Read only. These filters cannot be changed.',
  pathSeparator: ' > ',
  valuePlaceholder: 'enter text...',
  selectPlaceholder: 'Select...',
  noValue: 'no value',
  selectCondition: 'Select condition',
  incomplete: 'incomplete filter',
  branchAffordance: 'opens a list',
  exclusiveHint: 'cannot be combined with the other options',
  exclusiveAnnouncement: (label, cleared) =>
    cleared === 1
      ? `${label} selected. 1 other selection cleared.`
      : `${label} selected. ${cleared} other selections cleared.`,
  itemCount: (count) => `${count} items`,
  fieldsLabel: 'Attributes',
  resultsAnnouncement: (count) => (count === 1 ? '1 result' : `${count} results`),
  actionsLabel: 'Actions',
  countAnnouncement: (count) => (count === 1 ? '1 filter applied' : `${count} filters applied`),
  valueCount: (count) => `${count} selected`,
  valueDetail: (summary, values) => `${summary}: ${values.join(', ')}`,
  valueRange: (from, to) => `${from} to ${to}`,
  rangeFrom: (fieldLabel) => `${fieldLabel} from`,
  rangeTo: (fieldLabel) => `${fieldLabel} to`,
  rangeSeparator: 'to',
  negated: (operatorLabel) => `not ${operatorLabel}`,
}

/**
 * Shallow merge over the defaults, like the cascader's. A deep merge would leak
 * the default back into a replaced function-valued label for the arguments the
 * consumer did not think about.
 */
export function resolveFilterLabels(labels?: Partial<FilterLabels>): FilterLabels {
  if (!labels) return DEFAULT_FILTER_LABELS

  return { ...DEFAULT_FILTER_LABELS, ...labels }
}
