import { InvalidConfiguration } from '@monospace/extension-kit/data-connector';

export interface DirectusConfig {
	/** The Directus API root, always ending in `/` so relative endpoint paths keep its base path. */
	readonly baseUrl: URL;
	readonly token: string;
	/** A token that can write reaches real data, so create, update and delete are opt-in. */
	readonly enableWrites: boolean;
	/** Upper bound on records one query may fetch from Directus, including records a residual filter drops. */
	readonly maxRecordsPerQuery: number;
}

const DEFAULT_MAX_RECORDS_PER_QUERY = 5000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function parseConfig(value: unknown): DirectusConfig {
	if (!isObject(value)) throw new InvalidConfiguration('Directus configuration must be an object.');

	const baseUrl = parseBaseUrl(requiredString(value, 'url'));
	const token = requiredString(value, 'token');
	const enableWrites = value.enableWrites ?? false;

	if (typeof enableWrites !== 'boolean') {
		throw new InvalidConfiguration('Directus configuration `enableWrites` must be a boolean.');
	}

	const maxRecordsPerQuery = value.maxRecordsPerQuery ?? DEFAULT_MAX_RECORDS_PER_QUERY;

	if (typeof maxRecordsPerQuery !== 'number' || !Number.isSafeInteger(maxRecordsPerQuery) || maxRecordsPerQuery < 1) {
		throw new InvalidConfiguration('Directus configuration `maxRecordsPerQuery` must be a positive integer.');
	}

	return { baseUrl, token, enableWrites, maxRecordsPerQuery };
}

/**
 * HTTPS only, except on loopback hosts for a local instance. Credentials belong in `token`, and a
 * query or fragment would be dropped from every request, so all three are refused. A base path such
 * as `https://example.com/directus` is kept.
 */
function parseBaseUrl(value: string): URL {
	let url: URL;

	try {
		url = new URL(value);
	}
	catch (error) {
		throw new InvalidConfiguration('Directus configuration `url` must be an absolute URL.', { cause: error });
	}

	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
		throw new InvalidConfiguration('Directus configuration `url` must use HTTPS (plain HTTP is allowed for localhost only).');
	}

	if (url.username !== '' || url.password !== '') {
		throw new InvalidConfiguration('Directus configuration `url` must not contain credentials; pass the token as `token`.');
	}

	if (url.search !== '' || url.hash !== '') {
		throw new InvalidConfiguration('Directus configuration `url` must not contain a query or fragment.');
	}

	if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;

	return url;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
	const candidate = value[key];

	if (typeof candidate !== 'string' || candidate.trim() === '') {
		throw new InvalidConfiguration(`Directus configuration \`${key}\` must be a non-empty string.`);
	}

	return candidate;
}
