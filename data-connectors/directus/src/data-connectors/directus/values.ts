import type { CanonicalCollection, MonospaceObject, Value } from '@monospace/extension-kit/data-connector';
import { QueryRejected } from '@monospace/extension-kit/data-connector';
import { InvalidResponse } from './directus-types';

/**
 * Value handling by canonical field type: what Directus answers (normalized to Monospace's wire
 * forms), and what a filter literal becomes before it reaches Directus.
 */

const INTEGER = /^-?\d+$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/u;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/u;

export type FieldType = NonNullable<CanonicalCollection['fields']>[number]['type']['name'];

/** A value's position in its type's order, for the in-memory filter; compare two with `order`. */
export type Comparable = string | number | bigint | boolean | Decimal;

export function fieldTypes(collection: CanonicalCollection): ReadonlyMap<string, FieldType> {
	return new Map((collection.fields ?? []).map((field) => [field.name, field.type.name]));
}

/**
 * Brings Directus' answer to Monospace's wire forms: 64-bit integers and decimals as strings
 * (Directus sends numbers on SQLite and strings on Postgres), and SQLite's `0`/`1` booleans as
 * booleans.
 */
export function normalizeRecord(record: MonospaceObject, types: ReadonlyMap<string, FieldType>): MonospaceObject {
	return Object.fromEntries(Object.entries(record).map(([name, value]): [string, Value] => {
		const type = types.get(name);
		return [name, type === undefined || value === null ? value : normalizeValue(type, value, name)];
	}));
}

function normalizeValue(type: FieldType, value: Value, field: string): Value {
	switch (type) {
		case 'boolean':
			return value === 0 || value === 1 ? value === 1 : value;
		case 'int64':
		case 'uint64': {
			if (typeof value === 'string' && INTEGER.test(value)) return value;
			if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
			// A JSON number beyond 2^53 was already rounded by the time it was parsed.
			throw new InvalidResponse(`Directus returned \`${field}\` as a number that cannot hold a 64-bit integer exactly.`);
		}
		case 'decimal': {
			if (typeof value === 'number') return plainDecimal(value);
			if (typeof value === 'string' && parseDecimal(value) !== undefined) return value;
			throw new InvalidResponse(`Directus returned \`${field}\` as a value that is not a decimal.`);
		}
		default:
			return value;
	}
}

/**
 * What Directus should receive for a comparison with a literal: the literal itself when Directus
 * compares it exactly, the millisecond around a finer timestamp, or nothing it can compare exactly,
 * so the comparison is decided in memory.
 */
export type Literal =
	| { kind: 'exact'; value: Value }
	/** A timestamp finer than Directus' millisecond comparisons: the millisecond it falls in. */
	| { kind: 'millisecond'; floor: string; ceiling: string }
	| { kind: 'inexact' };

/**
 * Strings Directus rewrites before comparing (`@directus/utils` `parseFilter`): `true`, `false`,
 * `null` and `NULL` become those values, and dynamic variables such as `$CURRENT_USER` or
 * `$NOW(-1 day)` become the token's user or the current time. Directus has no escape for either.
 */
export function isReinterpretedByDirectus(value: string): boolean {
	return value === 'true' || value === 'false' || value === 'null' || value === 'NULL'
		|| ['$NOW', '$CURRENT_USER', '$CURRENT_ROLE', '$CURRENT_ROLES', '$CURRENT_POLICIES'].some((prefix) => value.startsWith(prefix));
}

export function literal(type: FieldType, value: Value, field: string): Literal {
	switch (type) {
		case 'string':
		case 'uuid':
			if (typeof value !== 'string') throw mismatch(field, type);
			return isReinterpretedByDirectus(value) ? { kind: 'inexact' } : { kind: 'exact', value };
		case 'boolean':
			if (typeof value !== 'boolean') throw mismatch(field, type);
			return { kind: 'exact', value };
		case 'int8':
		case 'int16':
		case 'int32':
		case 'uint8':
		case 'uint16':
		case 'uint32':
			if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw mismatch(field, type);
			return { kind: 'exact', value };
		case 'float32':
		case 'float64':
			if (typeof value !== 'number') throw mismatch(field, type);
			return { kind: 'exact', value };
		case 'int64':
		case 'uint64': {
			const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
			if (typeof text !== 'string' || !INTEGER.test(text)) throw mismatch(field, type);
			return { kind: 'exact', value: text };
		}
		case 'decimal': {
			const text = typeof value === 'number' ? plainDecimal(value) : value;
			const parsed = typeof text === 'string' ? parseDecimal(text) : undefined;
			if (typeof text !== 'string' || parsed === undefined) throw mismatch(field, type);
			// Directus converts decimal literals with `Number()`; only a literal that survives that
			// conversion unchanged compares exactly.
			const converted = parseDecimal(plainDecimal(Number(text)));
			return converted !== undefined && compareDecimals(parsed, converted) === 0 ? { kind: 'exact', value: text } : { kind: 'inexact' };
		}
		case 'date':
			if (typeof value !== 'string' || !DATE.test(value)) throw mismatch(field, type);
			return { kind: 'exact', value };
		case 'time': {
			const match = typeof value === 'string' ? TIME.exec(value) : null;
			if (match === null) throw mismatch(field, type);
			// Directus on SQLite turns any time literal longer than `HH:MM:SS` into `NaN`.
			return /^0*$/u.test(match[4] ?? '') ? { kind: 'exact', value: `${match[1]}:${match[2]}:${match[3]}` } : { kind: 'inexact' };
		}
		case 'dateTime':
		case 'dateTimeWithTimezone':
			return timestampLiteral(type, value, field);
		default:
			throw new QueryRejected(`Directus filters on \`${field}\` are not supported.`);
	}
}

/**
 * Directus compares timestamps at millisecond precision on SQLite (it converts the literal with
 * `new Date`), and at the column's precision elsewhere. A millisecond literal means the same on
 * both; a finer one is widened to its millisecond and decided in memory.
 */
function timestampLiteral(type: 'dateTime' | 'dateTimeWithTimezone', value: Value, field: string): Literal {
	const instant = typeof value === 'string' ? parseTimestamp(value) : undefined;
	if (instant === undefined || (type === 'dateTimeWithTimezone') !== instant.zoned) throw mismatch(field, type);

	const format = (milliseconds: bigint) => {
		const iso = new Date(Number(milliseconds)).toISOString();
		return type === 'dateTimeWithTimezone' ? iso : iso.slice(0, -1);
	};

	const milliseconds = instant.nanoseconds / 1_000_000n - (instant.nanoseconds % 1_000_000n < 0n ? 1n : 0n);
	const floor = format(milliseconds);

	return instant.nanoseconds % 1_000_000n === 0n
		? { kind: 'exact', value: floor }
		: { kind: 'millisecond', floor, ceiling: format(milliseconds + 1n) };
}

/** The in-memory order of `value` in a field of `type`, or `null` for NULL. */
export function comparable(type: FieldType, value: Value, field: string): Comparable | null {
	if (value === null) return null;

	switch (type) {
		case 'string':
		case 'uuid':
		case 'date':
			if (typeof value !== 'string') throw mismatch(field, type);
			return value;
		case 'boolean':
			if (value === 0 || value === 1) return value === 1;
			if (typeof value !== 'boolean') throw mismatch(field, type);
			return value;
		case 'int64':
		case 'uint64':
			if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
			if (typeof value !== 'string' || !INTEGER.test(value)) throw mismatch(field, type);
			return BigInt(value);
		case 'decimal': {
			const parsed = parseDecimal(typeof value === 'number' ? plainDecimal(value) : String(value));
			if (parsed === undefined) throw mismatch(field, type);
			return parsed;
		}
		case 'time': {
			const match = typeof value === 'string' ? TIME.exec(value) : null;
			if (match === null) throw mismatch(field, type);
			const seconds = BigInt(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
			return seconds * 1_000_000_000n + fraction(match[4]);
		}
		case 'dateTime':
		case 'dateTimeWithTimezone': {
			const instant = typeof value === 'string' ? parseTimestamp(value) : undefined;
			if (instant === undefined) throw mismatch(field, type);
			return instant.nanoseconds;
		}
		default:
			if (typeof value !== 'number') throw mismatch(field, type);
			return value;
	}
}

/**
 * Nanoseconds since the epoch, read without `Date.parse`, which drops everything below the
 * millisecond. A timestamp without an offset is read as UTC; only its order matters.
 */
function parseTimestamp(value: string): { nanoseconds: bigint; zoned: boolean } | undefined {
	const match = DATE_TIME.exec(value);
	if (match === null) return undefined;

	const [, date, time, digits, zone] = match;
	const seconds = Date.parse(`${date}T${time}Z`);
	if (Number.isNaN(seconds)) return undefined;

	let offsetMinutes = 0;

	if (zone !== undefined && zone !== 'Z') {
		const sign = zone.startsWith('-') ? -1 : 1;
		offsetMinutes = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
	}

	return {
		nanoseconds: (BigInt(seconds) - BigInt(offsetMinutes * 60_000)) * 1_000_000n + fraction(digits),
		zoned: zone !== undefined,
	};
}

function fraction(digits: string | undefined): bigint {
	return BigInt((digits ?? '').padEnd(9, '0'));
}

interface Decimal {
	kind: 'decimal';
	/** The value times `10 ** scale`. */
	digits: bigint;
	scale: number;
}

/** Negative, zero or positive as `left` sorts before, with or after `right` (both of one field's type). */
export function order(left: Comparable, right: Comparable): number {
	if (typeof left === 'object' && typeof right === 'object') return compareDecimals(left, right);
	if (typeof left === 'object' || typeof right === 'object') throw new TypeError('A decimal compares only with a decimal.');
	return left === right ? 0 : (left < right ? -1 : 1);
}

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/iu;

function parseDecimal(value: string): Decimal | undefined {
	const match = DECIMAL.exec(value);
	if (match === null) return undefined;

	const [, sign = '', whole = '', fractional = '', exponent = '0'] = match;
	if (whole === '' && fractional === '') return undefined;

	const digits = BigInt(`${sign === '-' ? '-' : ''}${whole}${fractional}` || '0');
	const scale = fractional.length - Number(exponent);

	return scale >= 0 ? { kind: 'decimal', digits, scale } : { kind: 'decimal', digits: digits * 10n ** BigInt(-scale), scale: 0 };
}

function compareDecimals(left: Decimal, right: Decimal): number {
	const scale = Math.max(left.scale, right.scale);
	const a = left.digits * 10n ** BigInt(scale - left.scale);
	const b = right.digits * 10n ** BigInt(scale - right.scale);
	return a === b ? 0 : (a < b ? -1 : 1);
}

/** A number's shortest decimal form without an exponent, which Engine's decimal parser needs. */
function plainDecimal(value: number): string {
	const text = String(value);
	if (!/e/iu.test(text)) return text;

	const parsed = parseDecimal(text);
	if (parsed === undefined) return text;

	const negative = parsed.digits < 0n;
	const digits = (negative ? -parsed.digits : parsed.digits).toString().padStart(parsed.scale + 1, '0');
	const whole = digits.slice(0, digits.length - parsed.scale);
	const fractional = digits.slice(digits.length - parsed.scale);

	return `${negative ? '-' : ''}${whole}${fractional === '' ? '' : `.${fractional}`}`;
}

function mismatch(field: string, type: FieldType): QueryRejected {
	return new QueryRejected(`A filter value for \`${field}\` is not a valid ${type}.`);
}
