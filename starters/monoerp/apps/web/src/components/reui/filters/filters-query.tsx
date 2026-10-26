import type {
  FilterCombinator,
  FilterGroupNode,
  FilterNode,
  FilterQuery,
  FilterRule,
} from '@/components/reui/filters/filters-types'

export function isFilterRule<V>(node: FilterNode<V>): node is FilterRule<V> {
  return node.type === 'rule'
}

export function isFilterGroup<V>(node: FilterNode<V>): node is FilterGroupNode<V> {
  return node.type === 'group'
}

/**
 * A rule. `id` is passed in, never generated here: a non-deterministic value in
 * a pure function broke hydration. Callers use `createFilterIdFactory`.
 */
export function createFilterRule<V = unknown>(input: {
  id: string
  path: string[]
  operator: string
  value?: V
  negated?: boolean
}): FilterRule<V> {
  const rule: FilterRule<V> = {
    id: input.id,
    type: 'rule',
    path: input.path,
    operator: input.operator,
    value: input.value,
  }

  if (input.negated) rule.negated = true

  return rule
}

/** An empty query. The root is always a group, never a bare array. */
export function createFilterQuery<V = unknown>(
  rules: FilterNode<V>[] = [],
  combinator: FilterCombinator = 'and',
  id = 'root',
): FilterQuery<V> {
  return { id, type: 'group', combinator, rules }
}

/** Every rule in the tree, depth first. Groups are flattened away. */
export function flattenFilterRules<V>(query: FilterQuery<V>): FilterRule<V>[] {
  const out: FilterRule<V>[] = []

  const walk = (node: FilterNode<V>) => {
    if (isFilterRule(node)) {
      out.push(node)

      return
    }

    for (const child of node.rules) walk(child)
  }

  walk(query)

  return out
}

/** How many rules the query holds, at any depth. */
export function countFilterRules<V>(query: FilterQuery<V>): number {
  let count = 0

  const walk = (node: FilterNode<V>) => {
    if (isFilterRule(node)) {
      count += 1

      return
    }

    for (const child of node.rules) walk(child)
  }

  walk(query)

  return count
}

/** Whether the query would match everything. */
export function isFilterQueryEmpty<V>(query: FilterQuery<V>): boolean {
  return countFilterRules(query) === 0
}

/** Locates a node and its parent. Returns null when the id is unknown. */
export function findFilterNode<V>(
  query: FilterQuery<V>,
  id: string,
): {
  node: FilterNode<V>
  parent: FilterGroupNode<V> | null
  index: number
} | null {
  if (query.id === id) return { node: query, parent: null, index: -1 }

  const walk = (
    group: FilterGroupNode<V>,
  ): {
    node: FilterNode<V>
    parent: FilterGroupNode<V>
    index: number
  } | null => {
    for (let i = 0; i < group.rules.length; i++) {
      const child = group.rules[i]

      if (child.id === id) return { node: child, parent: group, index: i }

      if (isFilterGroup(child)) {
        const found = walk(child)

        if (found) return found
      }
    }

    return null
  }

  return walk(query)
}

/** The rule with this id, or null when the id names a group or is unknown. */
export function findFilterRule<V>(query: FilterQuery<V>, id: string): FilterRule<V> | null {
  const found = findFilterNode(query, id)

  if (!found || !isFilterRule(found.node)) return null

  return found.node
}

/**
 * Rebuilds the tree, applying `transform` to the group holding `id`. An
 * unchanged subtree comes back BY IDENTITY, so `React.memo` holds for all but
 * the moved chip. Tests assert it with `toBe`. `removeFilterNode` and
 * `detachFilterNode` drop children rather than replace a group, so they
 * hand-roll the same identity-preserving walk.
 */
function rewriteGroup<V>(
  group: FilterGroupNode<V>,
  shouldRewrite: (group: FilterGroupNode<V>) => boolean,
  transform: (group: FilterGroupNode<V>) => FilterGroupNode<V>,
): FilterGroupNode<V> {
  if (shouldRewrite(group)) return transform(group)

  let changed = false

  const rules = group.rules.map((child) => {
    if (!isFilterGroup(child)) return child
    const next = rewriteGroup(child, shouldRewrite, transform)

    if (next !== child) changed = true

    return next
  })

  return changed ? { ...group, rules } : group
}

/** Replaces a rule's fields. Unknown ids return the query unchanged. */
export function updateFilterRule<V>(
  query: FilterQuery<V>,
  id: string,
  updates: Partial<Omit<FilterRule<V>, 'id' | 'type'>>,
): FilterQuery<V> {
  return rewriteGroup(
    query,
    (group) => group.rules.some((child) => child.id === id && isFilterRule(child)),
    (group) => ({
      ...group,
      rules: group.rules.map((child) =>
        child.id === id && isFilterRule(child) ? { ...child, ...updates } : child,
      ),
    }),
  )
}

/**
 * Removes a node, plus any group it empties, all the way up (not the root): an
 * empty group is invisible in the flat UI yet still compiles to parentheses.
 */
export function removeFilterNode<V>(query: FilterQuery<V>, id: string): FilterQuery<V> {
  const prune = (group: FilterGroupNode<V>): FilterGroupNode<V> => {
    let changed = false
    const rules: FilterNode<V>[] = []

    for (const child of group.rules) {
      if (child.id === id) {
        changed = true
        continue
      }

      if (isFilterGroup(child)) {
        const next = prune(child)

        if (next !== child) changed = true

        if (next.rules.length === 0) continue
        rules.push(next)
        continue
      }

      rules.push(child)
    }

    return changed ? { ...group, rules } : group
  }

  return prune(query)
}

/** Appends a node to a group, defaulting to the root. */
export function insertFilterNode<V>(
  query: FilterQuery<V>,
  node: FilterNode<V>,
  parentId?: string,
  index?: number,
): FilterQuery<V> {
  const targetId = parentId ?? query.id

  return rewriteGroup(
    query,
    (group) => group.id === targetId,
    (group) => {
      const rules = [...group.rules]
      const at = index === undefined ? rules.length : Math.max(0, Math.min(index, rules.length))
      rules.splice(at, 0, node)

      return { ...group, rules }
    },
  )
}

/**
 * A deep copy under fresh ids, the whole way down: children keeping their old
 * ids would give two live nodes one id, and every lookup here is by id.
 */
function cloneFilterNode<V>(node: FilterNode<V>, nextId: () => string): FilterNode<V> {
  return isFilterRule(node)
    ? { ...node, id: nextId() }
    : {
        ...node,
        id: nextId(),
        rules: node.rules.map((child) => cloneFilterNode(child, nextId)),
      }
}

/** Copies a node in beside the original. */
export function duplicateFilterNode<V>(
  query: FilterQuery<V>,
  id: string,
  nextId: () => string,
): FilterQuery<V> {
  const found = findFilterNode(query, id)

  if (!found || !found.parent) return query

  return insertFilterNode(
    query,
    cloneFilterNode(found.node, nextId),
    found.parent.id,
    found.index + 1,
  )
}

/** Empties the query, keeping the root's identity fields. */
export function clearFilterQuery<V>(query: FilterQuery<V>): FilterQuery<V> {
  return query.rules.length === 0 ? query : { ...query, rules: [] }
}
