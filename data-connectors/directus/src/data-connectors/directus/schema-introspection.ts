import type {
	FilterField,
	ReferentialAction,
	SchemaDocument,
} from '@monospace/extension-kit/data-connector';
import type { CollectionDefinition, FieldDefinition, FieldOptions, IndexDefinition } from '@monospace/extension-kit/data-connector/experimental';
import type { DirectusClient } from './client';
import type { DirectusConfig } from './config';
import type { DirectusCollection, DirectusField, DirectusRelation } from './directus-types';
import {
	defaultValue,
	defineCollection,
	defineRelation,
	defineSchema,
	field,
	filter,
	index,
	paging,
	sort,
} from '@monospace/extension-kit/data-connector/experimental';
import { decodeCollections, decodeFields, decodeRelations } from './directus-types';

const COMPARABLE = filter.field('equals', 'lessThan', 'lessThanOrEquals', 'greaterThan', 'greaterThanOrEquals', 'in');
// No ordered comparisons: Directus orders text by the database collation, not by code point.
const TEXT = filter.field('equals', 'in', 'contains', 'icontains', 'startsWith', 'endsWith');
const BOOLEAN_EQUALITY = filter.field('equals');
const UUID_EQUALITY = filter.field('equals', 'in');
const LOGICAL = filter.logical('and', 'or', 'not');
const BOTH_DIRECTIONS = sort.field('ascending', 'descending');

/**
 * Discovers the schema at runtime and declares it through the kit's schema helpers. Field maps
 * are only known at runtime, so `defineSchema` validates the whole graph when it is built.
 */
export async function introspectDirectus(
	client: DirectusClient,
	config: DirectusConfig,
): Promise<SchemaDocument> {
	const [discoveredCollections, discoveredFields, discoveredRelations] = await Promise.all([
		client.get('collections', decodeCollections),
		client.get('fields', decodeFields),
		client.get('relations', decodeRelations),
	]);

	const includedNames = new Set(discoveredCollections
		.filter((collection) => isItemCollection(collection))
		.map((collection) => collection.collection));
	const fieldsByCollection = groupFields(discoveredFields, includedNames);
	const collections = new Map(discoveredCollections
		.filter((collection) => includedNames.has(collection.collection))
		.map((collection) => [collection.collection, toCollection(
			collection,
			fieldsByCollection.get(collection.collection) ?? [],
			config.enableWrites,
		)]));
	const fieldsByIdentity = new Map(discoveredFields.map((directusField) => [fieldIdentity(directusField.collection, directusField.field), directusField]));
	const relations = discoveredRelations.flatMap((relation, position) => {
		const converted = toRelation(relation, position, collections, fieldsByIdentity, fieldsByCollection);
		return converted === undefined ? [] : [converted];
	});

	return defineSchema({ collections: [...collections.values()], relations }).toSchemaDocument();
}

function groupFields(fields: readonly DirectusField[], includedNames: ReadonlySet<string>): Map<string, DirectusField[]> {
	const grouped = new Map<string, DirectusField[]>();

	for (const directusField of fields) {
		if (!includedNames.has(directusField.collection) || !isScalarField(directusField)) continue;
		const collectionFields = grouped.get(directusField.collection) ?? [];
		collectionFields.push(directusField);
		grouped.set(directusField.collection, collectionFields);
	}

	return grouped;
}

function toCollection(
	collection: DirectusCollection,
	fields: readonly DirectusField[],
	enableWrites: boolean,
): CollectionDefinition {
	const definitions: Record<string, FieldDefinition> = Object.fromEntries(fields.map((directusField) => [
		directusField.field,
		toField(directusField),
	]));
	const indexes: Record<string, IndexDefinition> = {};

	for (const directusField of fields) {
		if (directusField.schema?.is_primary_key === true) {
			indexes[`${collection.collection}_${directusField.field}_primary`] = index.primary([directusField.field]);
		}
		else if (directusField.schema?.is_unique === true) {
			indexes[`${collection.collection}_${directusField.field}_unique`] = index.unique([directusField.field]);
		}
	}

	return defineCollection({
		name: collection.collection,
		apiName: collection.collection,
		fields: definitions,
		indexes,
		operations: operationsFor(fields, definitions, enableWrites),
	});
}

function toField(directusField: DirectusField): FieldDefinition {
	const options: FieldOptions = {
		apiName: directusField.field,
		nullable: directusField.schema?.is_nullable ?? true,
		...(directusField.schema?.has_auto_increment === true
			? { defaultValue: defaultValue.connectorManaged({ isAutoincrement: true }) }
			: {}),
	};

	switch (directusField.type) {
		case 'bigInteger': return field.int64(options);
		case 'binary': return field.bytes(options);
		case 'boolean': return field.boolean(options);
		case 'date': return field.date(options);
		case 'dateTime': return field.dateTime(options);
		case 'decimal': {
			const precision = directusField.schema?.numeric_precision ?? null;
			const scale = directusField.schema?.numeric_scale ?? null;
			// SQLite reports decimals without precision and scale; missing metadata says nothing
			// about how exactly the value is stored, so the decimal stays unconstrained.
			return precision !== null && scale !== null
				? field.decimal({ ...options, precision, scale })
				: field.decimal(options);
		}
		case 'float': return field.float64(options);
		case 'integer': return field.int32(options);
		case 'json':
		case 'csv': return field.json(options);
		case 'string': return field.string({ ...options, length: directusField.schema?.max_length ?? 'unlimited' });
		case 'hash':
		case 'text': return field.string(options);
		case 'time': return field.time(options);
		case 'timestamp': return field.dateTimeWithTimezone(options);
		case 'uuid': return field.uuid(options);
		default: return field.unsupported(options);
	}
}

function operationsFor(
	directusFields: readonly DirectusField[],
	fields: Readonly<Record<string, FieldDefinition>>,
	enableWrites: boolean,
): CollectionDefinition['operations'] {
	// A field of a type Monospace cannot represent is never returned or written.
	const output = Object.entries(fields)
		.filter(([, definition]) => definition.type.name !== 'unsupported')
		.map(([name]) => name);

	if (output.length === 0) return {};

	const filterFields = Object.fromEntries(Object.entries(fields).flatMap(([name, definition]) => {
		const operators = operatorsFor(definition.type.name);
		return operators === undefined ? [] : [[name, operators]];
	}));
	const withFilter = Object.keys(filterFields).length === 0
		? {}
		: { filter: { fields: filterFields, logicalOperators: LOGICAL } };
	const sortFields = Object.fromEntries(Object.entries(fields)
		.filter(([, definition]) => isSortable(definition.type.name))
		.map(([name]) => [name, BOTH_DIRECTIONS]));
	const readMany = {
		...withFilter,
		...(Object.keys(sortFields).length === 0 ? {} : { sort: sortFields }),
		limit: paging.limit(),
		offset: paging.offset(),
		output,
		meta: { totalCount: true },
	};
	const [primaryKey, ...otherKeys] = directusFields.filter((directusField) => directusField.schema?.is_primary_key === true);
	const keyOperators = primaryKey === undefined ? undefined : operatorsFor(fields[primaryKey.field]?.type.name);

	// Keyed operations and every write that the engine re-reads need `equals` and `in` on the stable
	// id; without them the engine refuses the declaration, so only reads are offered.
	if (otherKeys.length > 0 || keyOperators?.operators.equals === undefined || keyOperators.operators.in === undefined) {
		return { readMany };
	}

	const reads = { readMany, readOne: { ...withFilter, output } };

	if (!enableWrites) return reads;

	const createData = directusFields
		.filter((directusField) => output.includes(directusField.field) && isWritable(directusField, false))
		.map((directusField) => directusField.field);
	const updateData = directusFields
		.filter((directusField) => output.includes(directusField.field) && isWritable(directusField, true))
		.map((directusField) => directusField.field);
	const update = { ...withFilter, data: updateData, output };
	const remove = { ...withFilter, output };

	return {
		...reads,
		...(canCreate(fields, createData) ? { create: { data: createData, output } } : {}),
		...(updateData.length === 0 ? {} : { updateMany: update, updateOne: update }),
		deleteMany: remove,
		deleteOne: remove,
	};
}

/**
 * A create can only offer a required field Directus fills on its own if the field declares a
 * default, so a collection with a required, read-only field and no default offers no create.
 */
function canCreate(fields: Readonly<Record<string, FieldDefinition>>, data: readonly string[]): boolean {
	return data.length > 0 && Object.entries(fields).every(([name, definition]) =>
		data.includes(name) || definition.isNullable || definition.defaultValue !== undefined);
}

function isWritable(directusField: DirectusField, updating: boolean): boolean {
	return directusField.meta?.readonly !== true
		&& directusField.schema?.has_auto_increment !== true
		&& (!updating || directusField.schema?.is_primary_key !== true);
}

function operatorsFor(type: FieldDefinition['type']['name'] | undefined): FilterField | undefined {
	switch (type) {
		case 'string': return TEXT;
		case 'date':
		case 'dateTime':
		case 'dateTimeWithTimezone':
		case 'decimal':
		case 'float32':
		case 'float64':
		case 'int8':
		case 'int16':
		case 'int32':
		case 'int64':
		case 'time':
		case 'uint8':
		case 'uint16':
		case 'uint32':
		case 'uint64': return COMPARABLE;
		case 'boolean': return BOOLEAN_EQUALITY;
		case 'uuid': return UUID_EQUALITY;
		default: return undefined;
	}
}

function isSortable(type: FieldDefinition['type']['name']): boolean {
	return !['bytes', 'geometry', 'json', 'unsupported'].includes(type);
}

function toRelation(
	relation: DirectusRelation,
	position: number,
	collections: ReadonlyMap<string, CollectionDefinition>,
	fieldsByIdentity: ReadonlyMap<string, DirectusField>,
	fieldsByCollection: ReadonlyMap<string, readonly DirectusField[]>,
) {
	const manyCollection = relation.collection;
	const manyField = relation.field;
	const oneCollection = relation.related_collection;
	const from = collections.get(manyCollection);
	const to = oneCollection === null ? undefined : collections.get(oneCollection);

	if (from === undefined || to === undefined || oneCollection === null) return;

	const referencedFieldName = relation.schema?.foreign_key_column
		?? fieldsByCollection.get(oneCollection)?.find((directusField) => directusField.schema?.is_primary_key === true)?.field;
	const constrained = from.fields[manyField];
	const referenced = referencedFieldName === undefined ? undefined : to.fields[referencedFieldName];

	if (referencedFieldName === undefined || constrained === undefined || referenced === undefined) return;
	if (!fieldsByIdentity.has(fieldIdentity(manyCollection, manyField))) return;
	if (constrained.type.name !== referenced.type.name) return;

	return defineRelation({
		name: `${manyCollection}_${manyField}_${oneCollection}_${relation.meta?.id ?? position}`,
		from,
		to,
		on: [[manyField, referencedFieldName]],
		names: { forward: `${manyField}Related`, reverse: relation.meta?.one_field ?? `${manyCollection}Related` },
		onDelete: referentialAction(relation.schema?.on_delete),
		onUpdate: referentialAction(relation.schema?.on_update),
	});
}

function referentialAction(value: string | null | undefined): ReferentialAction {
	switch (value?.toUpperCase()) {
		case 'CASCADE': return 'cascade';
		case 'RESTRICT': return 'restrict';
		case 'SET DEFAULT': return 'setDefault';
		case 'SET NULL': return 'setNull';
		default: return 'noAction';
	}
}

function isScalarField(directusField: DirectusField): boolean {
	return directusField.type !== 'alias' && directusField.schema !== null;
}

/**
 * Collections served by `/items/<name>` as lists. Folders (`schema: null`) have no table, Directus
 * refuses `/items` for its own `directus_*` collections, and a singleton answers one object
 * rather than a list.
 */
function isItemCollection(collection: DirectusCollection): boolean {
	return collection.schema !== null && !collection.collection.startsWith('directus_') && collection.meta?.singleton !== true;
}

function fieldIdentity(collection: string, fieldName: string): string {
	return `${collection}\u0000${fieldName}`;
}
