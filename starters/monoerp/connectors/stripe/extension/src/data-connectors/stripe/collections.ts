import type {
  DeclaredOperator,
  FilterContract,
  SortField,
  SupportedOperations,
} from '@monospace/extension-kit/data-connector'
import type {
  DefinedSchema,
  FieldDefinition,
} from '@monospace/extension-kit/data-connector/experimental'
import {
  defaultValue,
  defineCollection,
  defineRelation,
  defineSchema,
  field,
  index,
} from '@monospace/extension-kit/data-connector/experimental'

/**
 * Stripe has no metadata API, so its objects are declared here and pinned to one API version:
 * `STRIPE_API_VERSION` and the field paths below change together.
 */
export const STRIPE_API_VERSION = '2026-08-26.dahlia'

type Fields = Readonly<Record<string, FieldDefinition>>

type FieldName<F extends Fields> = keyof F & string

/** Where a field lives in Stripe's API, when that differs from its name. */
export interface FieldMapping {
  /** Location in the Stripe object. Defaults to `[name]`. */
  readonly path?: readonly string[]
  /** Form key for writes. Defaults to the field name. */
  readonly formKey?: string
  /** List-endpoint parameter that filters the field by exact value. */
  readonly listParameter?: string
  /**
   * Values the list parameter accepts. Stripe rejects unknown enum values with an error, where a
   * filter should simply match nothing, so other values are never sent.
   */
  readonly listValues?: RegExp
}

export interface StripeResource<N extends string = string, F extends Fields = Fields> {
  readonly name: N
  /** Path below `/v1/`. */
  readonly path: string
  readonly fields: F
  readonly upstream?: { readonly [K in FieldName<F>]?: FieldMapping }
  /** Parameters every list call needs. */
  readonly baseListParameters?: Readonly<Record<string, string>>
  /** Whether the list endpoint accepts `created[gte]`/`created[lte]`. */
  readonly filtersCreated: boolean
  readonly create?: readonly FieldName<F>[]
  readonly update?: readonly FieldName<F>[]
  readonly delete?: boolean
}

function resource<const N extends string, const F extends Fields>(
  definition: StripeResource<N, F>,
): StripeResource<N, F> {
  return definition
}

const upstreamDefault = { defaultValue: defaultValue.connectorManaged() }

const id = field.string(upstreamDefault)

const created = field.dateTimeWithTimezone(upstreamDefault)

const livemode = field.boolean(upstreamDefault)

const metadata = field.json(upstreamDefault)

const text = field.string()

const optionalText = field.string({ nullable: true })

const amount = field.int64()

const BOOLEAN_VALUES = /^(?:true|false)$/u

const customers = resource({
  name: 'customers',
  path: 'customers',
  filtersCreated: true,
  fields: {
    id,
    name: optionalText,
    email: optionalText,
    description: optionalText,
    created,
    livemode,
    metadata,
  },
  upstream: { email: { listParameter: 'email' } },
  create: ['name', 'email', 'description'],
  update: ['name', 'email', 'description'],
  delete: true,
})

const products = resource({
  name: 'products',
  path: 'products',
  filtersCreated: true,
  fields: {
    id,
    name: text,
    description: optionalText,
    active: field.boolean(upstreamDefault),
    created,
    livemode,
    metadata,
  },
  upstream: { active: { listParameter: 'active', listValues: BOOLEAN_VALUES } },
  create: ['name', 'description', 'active'],
  update: ['name', 'description', 'active'],
  delete: true,
})

const prices = resource({
  name: 'prices',
  path: 'prices',
  filtersCreated: true,
  fields: {
    id,
    product: text,
    active: field.boolean(upstreamDefault),
    currency: text,
    unit_amount: field.int64({ nullable: true }),
    type: field.string(upstreamDefault),
    nickname: optionalText,
    recurring_interval: optionalText,
    created,
    livemode,
    metadata,
  },
  upstream: {
    product: { listParameter: 'product' },
    active: { listParameter: 'active', listValues: BOOLEAN_VALUES },
    recurring_interval: { path: ['recurring', 'interval'], formKey: 'recurring[interval]' },
  },
  create: ['product', 'active', 'currency', 'unit_amount', 'nickname', 'recurring_interval'],
  update: ['active', 'nickname'],
  // Stripe cannot delete prices; archive them with `active = false`.
})

const paymentIntents = resource({
  name: 'payment_intents',
  path: 'payment_intents',
  filtersCreated: true,
  fields: {
    id,
    amount,
    currency: text,
    customer: optionalText,
    description: optionalText,
    status: text,
    created,
    livemode,
    metadata,
  },
  upstream: { customer: { listParameter: 'customer' } },
})

const charges = resource({
  name: 'charges',
  path: 'charges',
  filtersCreated: true,
  fields: {
    id,
    amount,
    currency: text,
    customer: optionalText,
    payment_intent: optionalText,
    description: optionalText,
    status: text,
    created,
    livemode,
    metadata,
  },
  upstream: {
    customer: { listParameter: 'customer' },
    payment_intent: { listParameter: 'payment_intent' },
  },
})

export const STRIPE_RESOURCES: readonly StripeResource[] = [
  customers,
  products,
  prices,
  paymentIntents,
  charges,
]

/** A field Stripe can filter by exact value: the id (by retrieving it) or a list parameter. */
export function isExactFilterable(definition: StripeResource, name: string): boolean {
  return (
    name === 'id' ||
    (definition.upstream as Readonly<Record<string, FieldMapping>> | undefined)?.[name]
      ?.listParameter !== undefined
  )
}

const EXACT_OPERATORS: DeclaredOperator[] = ['equals', 'in']

// Monospace can't run `in` on a boolean.
const BOOLEAN_OPERATORS: DeclaredOperator[] = ['equals']

const CREATED_OPERATORS: DeclaredOperator[] = [
  'equals',
  'lessThan',
  'lessThanOrEquals',
  'greaterThan',
  'greaterThanOrEquals',
]

// Any order but newest first is sorted in memory (query.ts). Studio asks for it: it sorts every
// table by the primary key.
const ANY_DIRECTION: SortField = { directions: ['ascending', 'descending'] }

function declare(operators: readonly DeclaredOperator[]) {
  return { operators: Object.fromEntries(operators.map((operator) => [operator, {}])) }
}

/**
 * Declares only the filters Stripe's list and retrieve endpoints answer themselves: exact matches
 * on the id and on list parameters, and ranges on `created`. Which operations a collection offers
 * follows the resource's write lists.
 */
function collectionParts<const N extends string, const F extends Fields>(
  definition: StripeResource<N, F>,
  enableWrites: boolean,
) {
  const creatable = enableWrites ? [...(definition.create ?? [])] : []
  const updatable = enableWrites ? [...(definition.update ?? [])] : []
  const canDelete = enableWrites && definition.delete === true
  const names = Object.keys(definition.fields)

  const filter: FilterContract = {
    fields: Object.fromEntries(
      names.flatMap((name) => {
        if (isExactFilterable(definition, name)) {
          const isBoolean = definition.fields[name]!.type.name === 'boolean'

          return [[name, declare(isBoolean ? BOOLEAN_OPERATORS : EXACT_OPERATORS)]]
        }

        return name === 'created' && definition.filtersCreated
          ? [[name, declare(CREATED_OPERATORS)]]
          : []
      }),
    ),
    logicalOperators: { and: {}, or: {} },
  }

  const sort = Object.fromEntries(
    names
      .filter((name) => definition.fields[name]!.type.name !== 'json')
      .map((name) => [name, ANY_DIRECTION]),
  )

  const output = names
  const update = { filter, data: updatable, output }
  const remove = { filter, output }

  const operations: SupportedOperations = {
    readMany: { filter, sort, limit: {}, offset: {}, output },
    readOne: { filter, output },
    create: creatable.length > 0 ? { data: creatable, output } : undefined,
    updateMany: updatable.length > 0 ? update : undefined,
    updateOne: updatable.length > 0 ? update : undefined,
    deleteMany: canDelete ? remove : undefined,
    deleteOne: canDelete ? remove : undefined,
  }

  return { name: definition.name, fields: definition.fields, operations }
}

/** Engine exposes primitive fields in camelCase, so relation fields follow suit. */
function camelCase(name: string): string {
  return name.replaceAll(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase())
}

function relationNames(from: StripeResource, fieldName: string) {
  if (!isExactFilterable(from, fieldName)) {
    throw new Error(
      `\`${from.name}.${fieldName}\` cannot reference another collection: Stripe cannot filter by it.`,
    )
  }

  return {
    name: `${from.name}_${fieldName}_fkey`,
    names: { forward: `${camelCase(fieldName)}Object`, reverse: camelCase(from.name) },
  }
}

/**
 * The declared schema. Every relation's referencing field is filterable through Stripe, because
 * Engine loads a relation from both ends.
 */
export function stripeSchema(enableWrites: boolean): DefinedSchema {
  const customerCollection = defineCollection({
    ...collectionParts(customers, enableWrites),
    indexes: { customers_pkey: index.primary(['id']) },
  })

  const productCollection = defineCollection({
    ...collectionParts(products, enableWrites),
    indexes: { products_pkey: index.primary(['id']) },
  })

  const priceCollection = defineCollection({
    ...collectionParts(prices, enableWrites),
    indexes: { prices_pkey: index.primary(['id']) },
  })

  const paymentIntentCollection = defineCollection({
    ...collectionParts(paymentIntents, enableWrites),
    indexes: { payment_intents_pkey: index.primary(['id']) },
  })

  const chargeCollection = defineCollection({
    ...collectionParts(charges, enableWrites),
    indexes: { charges_pkey: index.primary(['id']) },
  })

  return defineSchema({
    collections: [
      customerCollection,
      productCollection,
      priceCollection,
      paymentIntentCollection,
      chargeCollection,
    ],
    relations: [
      defineRelation({
        ...relationNames(prices, 'product'),
        from: priceCollection,
        to: productCollection,
        on: [['product', 'id']],
      }),
      defineRelation({
        ...relationNames(paymentIntents, 'customer'),
        from: paymentIntentCollection,
        to: customerCollection,
        on: [['customer', 'id']],
      }),
      defineRelation({
        ...relationNames(charges, 'customer'),
        from: chargeCollection,
        to: customerCollection,
        on: [['customer', 'id']],
      }),
      defineRelation({
        ...relationNames(charges, 'payment_intent'),
        from: chargeCollection,
        to: paymentIntentCollection,
        on: [['payment_intent', 'id']],
      }),
    ],
  })
}
