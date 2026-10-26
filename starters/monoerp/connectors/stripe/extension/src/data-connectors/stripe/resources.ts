import type { FieldDefinition } from '@monospace/extension-kit/data-connector/experimental'
import type { FieldMapping, StripeResource } from './collections'
import { STRIPE_RESOURCES } from './collections'

/** How the query layer treats a field's values. */
export type FieldKind = 'id' | 'string' | 'int64' | 'boolean' | 'timestamp' | 'json'

export interface FieldSpec extends FieldMapping {
  readonly name: string
  readonly kind: FieldKind
  readonly isNullable: boolean
  readonly isCreatable: boolean
  readonly isUpdatable: boolean
}

export interface ResourceSpec {
  readonly name: string
  readonly path: string
  readonly fields: readonly FieldSpec[]
  readonly baseListParameters?: Readonly<Record<string, string>>
  readonly filtersCreated: boolean
  readonly canCreate: boolean
  readonly canUpdate: boolean
  readonly canDelete: boolean
}

export const RESOURCES: readonly ResourceSpec[] = STRIPE_RESOURCES.map((resource) =>
  toSpec(resource),
)

export function findResource(name: string): ResourceSpec | undefined {
  return RESOURCES.find((resource) => resource.name === name)
}

export function fieldPath(field: FieldSpec): readonly string[] {
  return field.path ?? [field.name]
}

function toSpec(resource: StripeResource): ResourceSpec {
  const upstream = (resource.upstream ?? {}) as Readonly<Record<string, FieldMapping>>
  const creatable = new Set<string>(resource.create)
  const updatable = new Set<string>(resource.update)

  return {
    name: resource.name,
    path: resource.path,
    filtersCreated: resource.filtersCreated,
    ...(resource.baseListParameters === undefined
      ? {}
      : { baseListParameters: resource.baseListParameters }),
    canCreate: creatable.size > 0,
    canUpdate: updatable.size > 0,
    canDelete: resource.delete === true,
    fields: Object.entries(resource.fields).map(([name, definition]) => ({
      ...upstream[name],
      name,
      kind: kindOf(name, definition),
      isNullable: definition.isNullable,
      isCreatable: creatable.has(name),
      isUpdatable: updatable.has(name),
    })),
  }
}

function kindOf(name: string, definition: FieldDefinition): FieldKind {
  if (name === 'id') return 'id'

  switch (definition.type.name) {
    case 'int64':
      return 'int64'
    case 'boolean':
      return 'boolean'
    case 'dateTimeWithTimezone':
      return 'timestamp'
    case 'json':
      return 'json'
    case 'string':
      return 'string'
    default:
      throw new Error(`Stripe field \`${name}\` has an unmapped type \`${definition.type.name}\`.`)
  }
}
