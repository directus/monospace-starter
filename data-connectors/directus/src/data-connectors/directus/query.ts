import type {
	CanonicalCollection,
	FilterSerialized,
	KeyedOperation,
	MonospaceObject,
	OperationName,
	OperationSerialized,
	QueryResultFor,
	QuerySerialized,
	SchemaDocument,
	SortItemSerialized,
	Value,
} from '@monospace/extension-kit/data-connector';
import type { DirectusClient } from './client';
import type { DirectusConfig } from './config';
import type { Pushdown, Translation } from './filter';
import type { FieldType } from './values';
import {
	CollectionNotFound,
	QueryRejected,
} from '@monospace/extension-kit/data-connector';
import { decodeCount, decodeRecords, InvalidResponse } from './directus-types';
import { matches, translateFilter } from './filter';
import { fieldTypes, normalizeRecord } from './values';

export interface QueryContext {
	client: DirectusClient;
	config: DirectusConfig;
	schema: SchemaDocument;
}

type Operation<Name extends OperationName> = Extract<OperationSerialized, { op: Name }>;

/** One collection as a query sees it. */
interface Target {
	client: DirectusClient;
	collection: CanonicalCollection;
	types: ReadonlyMap<string, FieldType>;
	budget: Budget;
}

/**
 * Serves every operation. Its return type is the union of every answer, so it cannot tell a keyed
 * answer from a filtered one; the keyed helpers below declare their own operation's answer instead.
 */
export async function executeQuery(context: QueryContext, request: QuerySerialized): Promise<QueryResultFor<OperationName>> {
	const query = request.query;

	if (query.namespace !== undefined) {
		throw new CollectionNotFound(`Directus has no namespace \`${query.namespace}\`.`);
	}

	const collection = context.schema.collections?.find((candidate) => candidate.name === query.collection);

	if (collection === undefined) {
		throw new CollectionNotFound(`Directus has no collection \`${query.collection}\`.`);
	}

	if (query.op !== 'readMany' && query.op !== 'readOne' && !context.config.enableWrites) {
		throw new QueryRejected('Writes are disabled for this Directus connection (`enableWrites`).');
	}

	const target: Target = {
		client: context.client,
		collection,
		types: fieldTypes(collection),
		budget: new Budget(context.config.maxRecordsPerQuery),
	};

	switch (query.op) {
		case 'readMany':
			if (query.count === true) return { totalCount: await count(target, query.filter) };
			return { records: await read(target, { ...query, select: query.select ?? [] }) };
		case 'readOne':
			return await readOne(target, query);
		case 'create':
			return { records: await create(target, query.data, query.select) };
		case 'updateMany':
			return { records: await update(target, query.filter, query.data, query.select) };
		case 'updateOne':
			return await updateOne(target, query);
		case 'deleteMany':
			return { records: await remove(target, query.filter, query.select) };
		case 'deleteOne':
			return await deleteOne(target, query);
		default:
			return unknownOperation(query);
	}
}

// The query is not echoed: a write carries caller data.
function unknownOperation(_query: never): never {
	throw new QueryRejected('The Directus example connector received an operation it does not know.');
}

async function readOne(target: Target, query: Operation<'readOne'>): Promise<QueryResultFor<'readOne'>> {
	const [record] = await read(target, { select: query.select, filter: keyedFilter(target.collection, query), limit: 1 });
	return { record: record ?? null };
}

async function updateOne(target: Target, query: Operation<'updateOne'>): Promise<QueryResultFor<'updateOne'>> {
	const [record] = await update(target, keyedFilter(target.collection, query), query.data, query.select);
	return { record: record ?? null };
}

async function deleteOne(target: Target, query: Operation<'deleteOne'>): Promise<QueryResultFor<'deleteOne'>> {
	const [record] = await remove(target, keyedFilter(target.collection, query), query.select);
	return { record: record ?? null };
}

/**
 * Stops a query that would fetch more than `maxRecordsPerQuery` records from Directus. Every
 * fetched record counts, including those the in-memory filter drops, and each request asks for at
 * most one record past the budget, so the budget also bounds the number of requests.
 */
class Budget {
	private fetched = 0;

	constructor(private readonly max: number) {}

	/** How many records the next request may ask for: one more than remain, to notice an overrun. */
	get allowance(): number {
		return this.max - this.fetched + 1;
	}

	/** A create sends its rows in page-sized batches; the budget caps it like a read. */
	admitWrite(count: number): void {
		if (count > this.max) {
			throw new QueryRejected(`The query would create more than ${this.max} records in Directus (\`maxRecordsPerQuery\`).`);
		}
	}

	spend(count: number): void {
		this.fetched += count;

		if (this.fetched > this.max) {
			throw new QueryRejected(`The query would read more than ${this.max} records from Directus (\`maxRecordsPerQuery\`); narrow its filter or lower its limit.`);
		}
	}
}

interface ReadRequest {
	select: readonly string[];
	filter?: FilterSerialized | undefined;
	sort?: readonly SortItemSerialized[] | undefined;
	limit?: number | undefined;
	offset?: number | undefined;
}

async function count(target: Target, filter: FilterSerialized | undefined): Promise<number> {
	const translation = translateFilter(filter, target.types);

	if (translation.pushdown.kind === 'none') return 0;

	if (translation.exact) {
		const parameters = filterParameters(translation.pushdown);
		parameters.set('aggregate[count]', '*');
		return await target.client.get(itemsPath(target.collection), decodeCount, parameters);
	}

	const records = await read(target, { select: [], filter });
	return records.length;
}

/**
 * Reads the records matching `request`. When Directus answers the filter exactly, `offset` and
 * `limit` go upstream; otherwise the read starts at the first candidate and applies the filter,
 * `offset` and `limit` in memory.
 */
async function read(target: Target, request: ReadRequest): Promise<MonospaceObject[]> {
	const translation = translateFilter(request.filter, target.types);
	const offset = request.offset ?? 0;
	const limit = request.limit ?? Number.POSITIVE_INFINITY;

	if (translation.pushdown.kind === 'none' || limit === 0) return [];

	if (translation.exact) {
		return project(await scan(target, translation, request.select, request.sort, offset, limit), request.select);
	}

	const fields = [...new Set([...request.select, ...fieldsOf(request.filter)])];
	const selected = await scan(target, translation, fields, request.sort, 0, offset + limit, (record) =>
		matches(request.filter, target.types, record));

	return project(selected.slice(offset), request.select);
}

/**
 * Pages through what Directus returns for `translation`, starting at `offset`, until `want`
 * records passed `keep` or Directus has no more. Pages are as large as Directus allows.
 */
async function scan(
	target: Target,
	translation: Translation,
	fields: readonly string[],
	sort: readonly SortItemSerialized[] | undefined,
	offset: number,
	want: number,
	keep?: (record: MonospaceObject) => boolean,
): Promise<MonospaceObject[]> {
	const pageSize = await target.client.maxPageSize();
	const parameters = filterParameters(translation.pushdown);

	parameters.set('fields', fields.length === 0 ? primaryKeyOf(target.collection) : fields.join(','));

	const orderBy = sortParameter(target.collection, sort);
	if (orderBy !== '') parameters.set('sort', orderBy);

	const kept: MonospaceObject[] = [];
	let fetched = 0;

	while (kept.length < want) {
		// Without `keep`, every record counts, so the page need not exceed what is still wanted.
		const size = Math.min(pageSize, target.budget.allowance, keep === undefined ? want - kept.length : pageSize);
		parameters.set('limit', String(size));
		parameters.set('offset', String(offset + fetched));

		const page = await target.client.get(itemsPath(target.collection), decodeRecords, parameters);
		target.budget.spend(page.length);
		fetched += page.length;

		for (const raw of page) {
			const record = normalizeRecord(raw, target.types);
			if (keep === undefined || keep(record)) kept.push(record);
		}

		if (page.length < size) break;
	}

	return kept.slice(0, want);
}

async function create(target: Target, rows: readonly MonospaceObject[], select: readonly string[]): Promise<MonospaceObject[]> {
	target.budget.admitWrite(rows.length);

	const records: MonospaceObject[] = [];

	for (const chunk of chunks(rows, await target.client.maxPageSize())) {
		const created = await target.client.post(itemsPath(target.collection), decodeRecords, writeParameters(target.collection, select, chunk.length), chunk);
		records.push(...created.map((record) => normalizeRecord(record, target.types)));
	}

	return project(records, select);
}

/**
 * Resolves the matching keys first and then updates exactly those. Directus' own update-by-query
 * applies its default read limit to the matching step, so it would silently update only the first
 * page of a larger match. The budget refuses an oversized target set before anything is written.
 * Batches run one after another; a failure stops the rest, and earlier batches stay applied.
 */
async function update(
	target: Target,
	filter: FilterSerialized | undefined,
	data: MonospaceObject,
	select: readonly string[],
): Promise<MonospaceObject[]> {
	const primaryKey = primaryKeyOf(target.collection);
	const matching = await read(target, { select: [primaryKey], filter });
	const records: MonospaceObject[] = [];

	for (const chunk of chunks(matching.map((record) => keyOf(record, primaryKey)), await target.client.maxPageSize())) {
		const updated = await target.client.patch(
			itemsPath(target.collection),
			decodeRecords,
			writeParameters(target.collection, select, chunk.length),
			{ keys: chunk, data },
		);
		records.push(...updated.map((record) => normalizeRecord(record, target.types)));
	}

	return project(records, select);
}

/**
 * Directus answers deletes with `204` and no records, so the requested output is read first and
 * exactly those keys are deleted. Concurrent writers can change a row between the two calls.
 */
async function remove(
	target: Target,
	filter: FilterSerialized | undefined,
	select: readonly string[],
): Promise<MonospaceObject[]> {
	const primaryKey = primaryKeyOf(target.collection);
	const records = await read(target, { select: select.includes(primaryKey) ? select : [...select, primaryKey], filter });

	for (const chunk of chunks(records.map((record) => keyOf(record, primaryKey)), await target.client.maxPageSize())) {
		await target.client.delete(itemsPath(target.collection), chunk);
	}

	return project(records, select);
}

/**
 * The key addresses the row; the optional guard must also match, otherwise nothing is read or
 * written and the operation answers `record: null`.
 */
function keyedFilter(collection: CanonicalCollection, query: KeyedOperation): FilterSerialized {
	const primaryKey = primaryKeyOf(collection);
	const entries = Object.entries(query.key);
	const [entry] = entries;

	if (entry === undefined || entries.length !== 1 || entry[0] !== primaryKey) {
		throw new QueryRejected(`A \`${collection.name}\` key must name exactly its primary key \`${primaryKey}\`.`);
	}

	const byKey: FilterSerialized = { cmp: 'equals', left: { field: primaryKey }, right: { value: entry[1] } };
	return query.filter === undefined ? byKey : { and: [byKey, query.filter] };
}

function primaryKeyOf(collection: CanonicalCollection): string {
	const fields = collection.indexes?.find((candidate) => candidate.kind === 'primary')?.fields ?? [];
	const [field] = fields;

	if (field === undefined || fields.length !== 1) {
		throw new QueryRejected(`Directus collection \`${collection.name}\` has no single-field primary key.`);
	}

	return field;
}

/** A row's primary key value. Every row read here selected it, so its absence is a Directus fault. */
function keyOf(record: MonospaceObject, primaryKey: string): Value {
	const value = record[primaryKey];
	if (value === undefined || value === null) throw new InvalidResponse(`Directus returned a row without its primary key \`${primaryKey}\`.`);
	return value;
}

function fieldsOf(filter: FilterSerialized | undefined): string[] {
	if (filter === undefined) return [];
	if (filter.and !== undefined) return filter.and.flatMap((child) => fieldsOf(child));
	if (filter.or !== undefined) return filter.or.flatMap((child) => fieldsOf(child));
	if (filter.not !== undefined) return fieldsOf(filter.not);
	if (filter.in !== undefined) return filter.in.field === undefined ? [] : [filter.in.field];
	return [filter.left.field, filter.right.field].filter((field) => field !== undefined);
}

/** The primary key closes every sort so pages taken at successive offsets never overlap. */
function sortParameter(collection: CanonicalCollection, sort: readonly SortItemSerialized[] | undefined): string {
	const items = sort ?? [];

	for (const item of items) {
		if (item.nulls !== undefined) {
			throw new QueryRejected('Directus does not expose explicit null ordering.');
		}
	}

	const primary = collection.indexes?.find((candidate) => candidate.kind === 'primary')?.fields ?? [];
	const tiebreakers = primary.filter((field) => !items.some((item) => item.field === field));

	return [
		...items.map((item) => (item.direction === 'descending' ? `-${item.field}` : item.field)),
		...tiebreakers,
	].join(',');
}

/**
 * Directus reads the written rows back with this query, so its `limit` must cover the whole batch.
 * Without requested output only the primary key is read back, the least Directus can return.
 */
function writeParameters(collection: CanonicalCollection, select: readonly string[], batchSize: number): URLSearchParams {
	return new URLSearchParams({
		limit: String(batchSize),
		fields: select.length === 0 ? primaryKeyOf(collection) : select.join(','),
	});
}

function filterParameters(pushdown: Pushdown): URLSearchParams {
	const parameters = new URLSearchParams();
	if (pushdown.kind === 'filter') parameters.set('filter', JSON.stringify(pushdown.filter));
	return parameters;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
	const result: T[][] = [];
	for (let start = 0; start < values.length; start += size) result.push(values.slice(start, start + size));
	return result;
}

function project(records: readonly MonospaceObject[], select: readonly string[]): MonospaceObject[] {
	return records.map((record) => Object.fromEntries(select.map((field) => [field, record[field] ?? null])));
}

function itemsPath(collection: CanonicalCollection): string {
	return `items/${encodeURIComponent(collection.name)}`;
}
