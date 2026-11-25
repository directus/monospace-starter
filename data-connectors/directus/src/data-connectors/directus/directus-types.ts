import type { MonospaceObject, Value } from '@monospace/extension-kit/data-connector';

/**
 * The Directus response shapes this connector reads, and decoders that check them at the client
 * boundary. Only the properties the connector uses are checked; Directus sends more.
 */

export interface DirectusCollection {
	collection: string;
	meta: { singleton: boolean } | null;
	/** `null` for a folder, which only groups collections in Directus' data model. */
	schema: object | null;
}

export interface DirectusField {
	collection: string;
	field: string;
	type: string;
	meta: { readonly: boolean } | null;
	schema: {
		has_auto_increment: boolean;
		is_nullable: boolean;
		is_primary_key: boolean;
		is_unique: boolean;
		max_length: number | null;
		numeric_precision: number | null;
		numeric_scale: number | null;
	} | null;
}

export interface DirectusRelation {
	collection: string;
	field: string;
	related_collection: string | null;
	meta: {
		id: number | null;
		one_field: string | null;
	} | null;
	schema: {
		foreign_key_column: string | null;
		on_delete: string | null;
		on_update: string | null;
	} | null;
}

export interface ServerInfo {
	/** Absent when the token's role may not see server limits. `-1` means unbounded. */
	queryLimit: { default: number | null; max: number | null } | null;
}

export class InvalidResponse extends Error {}

export function decodeCollections(data: unknown): DirectusCollection[] {
	return list(data, 'collections', (entry) => {
		const meta = nullableObject(entry.meta, 'collection meta');
		const schema = nullableObject(entry.schema, 'collection schema');

		return {
			collection: string(entry.collection, 'collection name'),
			meta: meta === null ? null : { singleton: meta.singleton === true },
			schema,
		};
	});
}

export function decodeFields(data: unknown): DirectusField[] {
	return list(data, 'fields', (entry) => {
		const meta = nullableObject(entry.meta, 'field meta');
		const schema = nullableObject(entry.schema, 'field schema');

		return {
			collection: string(entry.collection, 'field collection'),
			field: string(entry.field, 'field name'),
			type: string(entry.type, 'field type'),
			meta: meta === null ? null : { readonly: meta.readonly === true },
			schema: schema === null
				? null
				: {
						has_auto_increment: schema.has_auto_increment === true,
						// Directus omits nullability for some virtual columns; nullable is the safe reading.
						is_nullable: schema.is_nullable !== false,
						is_primary_key: schema.is_primary_key === true,
						is_unique: schema.is_unique === true,
						max_length: optionalInteger(schema.max_length, 'max_length'),
						numeric_precision: optionalInteger(schema.numeric_precision, 'numeric_precision'),
						numeric_scale: optionalInteger(schema.numeric_scale, 'numeric_scale'),
					},
		};
	});
}

export function decodeRelations(data: unknown): DirectusRelation[] {
	return list(data, 'relations', (entry) => {
		const meta = nullableObject(entry.meta, 'relation meta');
		const schema = nullableObject(entry.schema, 'relation schema');

		return {
			collection: string(entry.collection, 'relation collection'),
			field: string(entry.field, 'relation field'),
			related_collection: optionalString(entry.related_collection, 'related_collection'),
			meta: meta === null
				? null
				: {
						id: optionalInteger(meta.id, 'relation id'),
						one_field: optionalString(meta.one_field, 'one_field'),
					},
			schema: schema === null
				? null
				: {
						foreign_key_column: optionalString(schema.foreign_key_column, 'foreign_key_column'),
						on_delete: optionalString(schema.on_delete, 'on_delete'),
						on_update: optionalString(schema.on_update, 'on_update'),
					},
		};
	});
}

export function decodeServerInfo(data: unknown): ServerInfo {
	if (!isObject(data)) throw new InvalidResponse('Directus returned server info that is not an object.');
	const limit = nullableObject(data.queryLimit, 'queryLimit');

	return {
		queryLimit: limit === null
			? null
			: { default: optionalInteger(limit.default, 'queryLimit.default'), max: optionalInteger(limit.max, 'queryLimit.max') },
	};
}

export function decodeRecords(data: unknown): MonospaceObject[] {
	if (!Array.isArray(data)) throw new InvalidResponse('Directus returned items that are not a list.');

	return data.map((entry) => {
		if (!isRecord(entry)) throw new InvalidResponse('Directus returned an item that is not an object.');
		return entry;
	});
}

/** The `aggregate[count]=*` answer: one group whose `count` is a number or, on some databases, a numeric string. */
export function decodeCount(data: unknown): number {
	const [group] = Array.isArray(data) ? data : [];
	const raw: unknown = isObject(group) ? group.count : undefined;
	const count = typeof raw === 'string' && /^\d+$/u.test(raw) ? Number(raw) : raw;

	if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
		throw new InvalidResponse('Directus returned a count that is not a safe non-negative integer.');
	}

	return count;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRecord(value: unknown): value is MonospaceObject {
	return isObject(value) && Object.values(value).every(isValue);
}

function isValue(value: unknown): value is Value {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (Array.isArray(value)) return value.every(isValue);
	return isRecord(value);
}

function list<T>(data: unknown, what: string, decode: (entry: Record<string, unknown>) => T): T[] {
	if (!Array.isArray(data)) throw new InvalidResponse(`Directus returned ${what} that are not a list.`);

	return data.map((entry) => {
		if (!isObject(entry)) throw new InvalidResponse(`Directus returned ${what} entries that are not objects.`);
		return decode(entry);
	});
}

function nullableObject(value: unknown, what: string): Record<string, unknown> | null {
	if (value === null || value === undefined) return null;
	if (!isObject(value)) throw new InvalidResponse(`Directus returned ${what} that is not an object.`);
	return value;
}

function string(value: unknown, what: string): string {
	if (typeof value !== 'string') throw new InvalidResponse(`Directus returned a ${what} that is not a string.`);
	return value;
}

function optionalString(value: unknown, what: string): string | null {
	return value === null || value === undefined ? null : string(value, what);
}

function optionalInteger(value: unknown, what: string): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new InvalidResponse(`Directus returned a ${what} that is not an integer.`);
	return value;
}
