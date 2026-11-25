import type {
	FilterOperandSerialized,
	FilterOperator,
	FilterSerialized,
	MonospaceObject,
	Value,
} from '@monospace/extension-kit/data-connector';
import type { Comparable, FieldType } from './values';
import { QueryRejected } from '@monospace/extension-kit/data-connector';
import { comparable, isReinterpretedByDirectus, literal, order } from './values';

export type DirectusFilter = Record<string, unknown>;

/** What Directus receives: no filter, a filter that matches nothing (answered without a request), or a filter. */
export type Pushdown =
	| { kind: 'all' }
	| { kind: 'none' }
	| { kind: 'filter'; filter: DirectusFilter };

/**
 * The Directus filter for a Monospace filter. It matches a superset of the Monospace filter's
 * records; `exact` says it matches exactly those. When it does not, every record Directus returns
 * must pass `matches`, and `offset`, `limit` and counts are applied in memory.
 */
export interface Translation {
	pushdown: Pushdown;
	exact: boolean;
}

type Comparison = '_eq' | '_neq' | '_gt' | '_gte' | '_lt' | '_lte';
type TextOperator = 'contains' | 'icontains' | 'startsWith' | 'endsWith';

const COMPARISON: Readonly<Record<Exclude<FilterOperator, TextOperator>, readonly [Comparison, Comparison]>> = {
	equals: ['_eq', '_neq'],
	greaterThan: ['_gt', '_lte'],
	greaterThanOrEquals: ['_gte', '_lt'],
	lessThan: ['_lt', '_gte'],
	lessThanOrEquals: ['_lte', '_gt'],
};

const TEXT: Readonly<Record<TextOperator, string>> = {
	contains: '_contains',
	icontains: '_icontains',
	startsWith: '_starts_with',
	endsWith: '_ends_with',
};

const REVERSED: Readonly<Record<Exclude<FilterOperator, TextOperator>, Exclude<FilterOperator, TextOperator>>> = {
	equals: 'equals',
	greaterThan: 'lessThan',
	greaterThanOrEquals: 'lessThanOrEquals',
	lessThan: 'greaterThan',
	lessThanOrEquals: 'greaterThanOrEquals',
};

const ALL: Translation = { pushdown: { kind: 'all' }, exact: true };
const NONE: Translation = { pushdown: { kind: 'none' }, exact: true };
const UNDECIDED: Translation = { pushdown: { kind: 'all' }, exact: false };

export function translateFilter(filter: FilterSerialized | undefined, types: ReadonlyMap<string, FieldType>): Translation {
	return filter === undefined ? ALL : translate(filter, false, types);
}

/**
 * Directus has no general `not`, so negation is pushed to the leaves (De Morgan, complementary
 * operators), which SQL three-valued logic allows. Leaves Directus cannot answer exactly become
 * a wider filter, or no filter at all, and are decided in memory.
 */
function translate(filter: FilterSerialized, negated: boolean, types: ReadonlyMap<string, FieldType>): Translation {
	if (filter.not !== undefined) return translate(filter.not, !negated, types);

	if (filter.and !== undefined) {
		const children = filter.and.map((child) => translate(child, negated, types));
		return negated ? any(children) : every(children);
	}

	if (filter.or !== undefined) {
		const children = filter.or.map((child) => translate(child, negated, types));
		return negated ? every(children) : any(children);
	}

	if (filter.in !== undefined) {
		if (filter.in.field === undefined || !Array.isArray(filter.values)) {
			throw new QueryRejected('Directus filters compare a field with literal values, not with another field.');
		}

		return membership(filter.in.field, fieldType(types, filter.in.field), filter.values, negated);
	}

	const { field, operator, value } = comparisonParts(filter.left, filter.right, filter.cmp);
	const type = fieldType(types, field);

	return isTextOperator(operator)
		? text(field, type, operator, value, negated)
		: comparison(field, type, operator, value, negated);
}

function comparison(field: string, type: FieldType, operator: Exclude<FilterOperator, TextOperator>, value: Value, negated: boolean): Translation {
	const [positive, complement] = COMPARISON[operator];
	const upstream = negated ? complement : positive;

	if (value === null) {
		// `field = null` is IS NULL; any other comparison with NULL is UNKNOWN, negated or not.
		if (operator !== 'equals') return NONE;
		return leaf(field, negated ? '_nnull' : '_null', true);
	}

	// Directus orders strings by the database collation, which need not be code point order.
	if (type === 'string' && operator !== 'equals') return UNDECIDED;

	const encoded = literal(type, value, field);

	switch (encoded.kind) {
		case 'exact':
			return leaf(field, upstream, encoded.value);
		case 'inexact':
			return UNDECIDED;
		case 'millisecond': {
			const widened = millisecondRange(field, upstream, encoded.floor, encoded.ceiling);
			return widened === undefined ? UNDECIDED : { pushdown: { kind: 'filter', filter: widened }, exact: false };
		}
	}
}

/** The millisecond range a finer timestamp comparison falls in: `> t` and `>= t` both become `>= floor(t)`. */
function millisecondRange(field: string, operator: Comparison, floor: string, ceiling: string): DirectusFilter | undefined {
	switch (operator) {
		case '_gt':
		case '_gte': return { [field]: { _gte: floor } };
		case '_lt':
		case '_lte': return { [field]: { _lt: ceiling } };
		case '_eq': return { _and: [{ [field]: { _gte: floor } }, { [field]: { _lt: ceiling } }] };
		case '_neq': return undefined;
	}
}

/**
 * Directus builds `LIKE '%value%'` without escaping `%` and `_`, and SQLite's and MySQL's `LIKE`
 * ignore case, so a match is only a candidate. Negated forms would drop records and are decided
 * in memory entirely. Postgres and MySQL read `\` and SQL Server `[` as pattern syntax, which
 * could drop matches, so such literals are not sent either.
 */
function text(field: string, type: FieldType, operator: TextOperator, value: Value, negated: boolean): Translation {
	if (type !== 'string') throw new QueryRejected(`\`${operator}\` applies to text fields, and \`${field}\` is not one.`);
	if (typeof value !== 'string') throw new QueryRejected(`A filter value for \`${field}\` is not a valid string.`);
	if (negated || /[\\[]/u.test(value) || isReinterpretedByDirectus(value)) return UNDECIDED;

	// `_icontains` lowers both sides (SQLite only folds ASCII), so without wildcards an ASCII literal is exact.
	const exact = operator === 'icontains' && isPrintableAscii(value) && !/[%_]/u.test(value);

	return { pushdown: { kind: 'filter', filter: { [field]: { [TEXT[operator]]: value } } }, exact };
}

/**
 * SQL `IN`: NULL on the left is UNKNOWN, a NULL in the list never matches, so `not in` a list
 * holding NULL is never true. Directus refuses an empty `_in`, which matches nothing anyway.
 */
function membership(field: string, type: FieldType, values: readonly Value[], negated: boolean): Translation {
	const present = values.filter((value) => value !== null);

	if (negated && present.length < values.length) return NONE;
	if (present.length === 0) return negated ? leaf(field, '_nnull', true) : NONE;

	const encoded = present.map((value) => literal(type, value, field));
	const exact: Value[] = [];

	for (const candidate of encoded) {
		if (candidate.kind !== 'exact') {
			const each = present.map((value) => comparison(field, type, 'equals', value, negated));
			return negated ? every(each) : any(each);
		}

		exact.push(candidate.value);
	}

	return leaf(field, negated ? '_nin' : '_in', exact);
}

function isPrintableAscii(value: string): boolean {
	return [...value].every((character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 0x20 && code <= 0x7E;
	});
}

function leaf(field: string, operator: string, value: Value): Translation {
	return { pushdown: { kind: 'filter', filter: { [field]: { [operator]: value } } }, exact: true };
}

function every(children: readonly Translation[]): Translation {
	const exact = children.every((child) => child.exact);
	if (children.some((child) => child.pushdown.kind === 'none')) return { pushdown: { kind: 'none' }, exact };
	return combine('_and', children, exact, 'all');
}

function any(children: readonly Translation[]): Translation {
	const exact = children.every((child) => child.exact);
	if (children.some((child) => child.pushdown.kind === 'all')) return { pushdown: { kind: 'all' }, exact };
	return combine('_or', children, exact, 'none');
}

function combine(group: '_and' | '_or', children: readonly Translation[], exact: boolean, empty: 'all' | 'none'): Translation {
	const filters = children.flatMap((child) => (child.pushdown.kind === 'filter' ? [child.pushdown.filter] : []));
	const [only] = filters;

	if (only === undefined) return { pushdown: { kind: empty }, exact };
	if (filters.length === 1) return { pushdown: { kind: 'filter', filter: only }, exact };
	return { pushdown: { kind: 'filter', filter: { [group]: filters } }, exact };
}

function comparisonParts(
	left: FilterOperandSerialized,
	right: FilterOperandSerialized,
	operator: FilterOperator,
): { field: string; operator: FilterOperator; value: Value } {
	if (left.field !== undefined && right.field === undefined) {
		return { field: left.field, operator, value: right.value };
	}

	if (left.field === undefined && right.field !== undefined) {
		if (isTextOperator(operator)) {
			throw new QueryRejected(`Directus cannot reverse the \`${operator}\` string comparison.`);
		}

		return { field: right.field, operator: REVERSED[operator], value: left.value };
	}

	throw new QueryRejected('Directus filters require one field operand and one literal operand.');
}

function isTextOperator(operator: FilterOperator): operator is TextOperator {
	return operator in TEXT;
}

function fieldType(types: ReadonlyMap<string, FieldType>, field: string): FieldType {
	const type = types.get(field);
	if (type === undefined) throw new QueryRejected(`The filter names an unknown field \`${field}\`.`);
	return type;
}

/**
 * The in-memory check of the whole filter, with SQL three-valued logic: a comparison with NULL is
 * UNKNOWN, `not UNKNOWN` stays UNKNOWN, and only TRUE selects a record. `field = null` is IS NULL.
 */
export function matches(filter: FilterSerialized | undefined, types: ReadonlyMap<string, FieldType>, record: MonospaceObject): boolean {
	return filter === undefined || evaluate(filter, types, record) === true;
}

type Truth = boolean | null;

function evaluate(filter: FilterSerialized, types: ReadonlyMap<string, FieldType>, record: MonospaceObject): Truth {
	if (filter.and !== undefined) {
		let result: Truth = true;

		for (const child of filter.and) {
			const truth = evaluate(child, types, record);
			if (truth === false) return false;
			if (truth === null) result = null;
		}

		return result;
	}

	if (filter.or !== undefined) {
		let result: Truth = false;

		for (const child of filter.or) {
			const truth = evaluate(child, types, record);
			if (truth === true) return true;
			if (truth === null) result = null;
		}

		return result;
	}

	if (filter.not !== undefined) {
		const truth = evaluate(filter.not, types, record);
		return truth === null ? null : !truth;
	}

	if (filter.in !== undefined) {
		if (filter.in.field === undefined || !Array.isArray(filter.values)) {
			throw new QueryRejected('Directus filters compare a field with literal values, not with another field.');
		}

		const field = filter.in.field;
		const type = fieldType(types, field);
		const left = comparable(type, record[field] ?? null, field);
		if (left === null) return null;

		let result: Truth = false;

		for (const value of filter.values) {
			const right = comparable(type, value, field);
			if (right === null) result = null;
			else if (order(left, right) === 0) return true;
		}

		return result;
	}

	const { field, operator, value } = comparisonParts(filter.left, filter.right, filter.cmp);
	const type = fieldType(types, field);
	const left = comparable(type, record[field] ?? null, field);

	if (value === null) return operator === 'equals' ? left === null : null;

	const right = comparable(type, value, field);
	if (left === null || right === null) return null;

	return apply(operator, left, right);
}

function apply(operator: FilterOperator, left: Comparable, right: Comparable): boolean {
	switch (operator) {
		case 'equals': return order(left, right) === 0;
		case 'lessThan': return order(left, right) < 0;
		case 'lessThanOrEquals': return order(left, right) <= 0;
		case 'greaterThan': return order(left, right) > 0;
		case 'greaterThanOrEquals': return order(left, right) >= 0;
		case 'contains': return String(left).includes(String(right));
		case 'icontains': return String(left).toLowerCase().includes(String(right).toLowerCase());
		case 'startsWith': return String(left).startsWith(String(right));
		case 'endsWith': return String(left).endsWith(String(right));
	}
}
