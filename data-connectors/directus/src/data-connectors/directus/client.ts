import {
	AccessDenied,
	ConnectionFailed,
	ForeignKeyConstraintViolation,
	NullConstraintViolation,
	QueryRejected,
	RateLimited,
	UniqueConstraintViolation,
} from '@monospace/extension-kit/data-connector';
import { decodeServerInfo, InvalidResponse, isObject } from './directus-types';

/** The largest page the connector asks for, whatever Directus' own `QUERY_LIMIT_MAX` allows. */
const MAX_PAGE_SIZE = 500;

/**
 * Requests one connection keeps in flight to Directus. Engine sends up to 16 reads at once for a
 * paged include, and callers add their own; each Directus request can hold one of its database
 * pool's connections, so the connector leaves most of that pool to Directus' other clients.
 */
const MAX_IN_FLIGHT = 4;

/**
 * How long one request, including reading its answer, may take. Engine puts no deadline on a query,
 * so without one a hung Directus would hang the caller and hold one of the connection's slots.
 */
const REQUEST_TIMEOUT_MS = 30_000;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class DirectusClient {
	private pageSize: Promise<number> | undefined;
	private inFlight = 0;
	private readonly waiting: (() => void)[] = [];

	constructor(
		private readonly baseUrl: URL,
		private readonly token: string,
	) {}

	/**
	 * The records one item request asks for at most. Directus rejects a `limit` above its
	 * `QUERY_LIMIT_MAX`; a token that may not see that limit gets Directus' default page size, which
	 * never exceeds the maximum.
	 */
	async maxPageSize(): Promise<number> {
		this.pageSize ??= this.get('server/info', decodeServerInfo).then(({ queryLimit }) => {
			const max = queryLimit?.max;
			if (max === -1) return MAX_PAGE_SIZE;
			if (typeof max === 'number' && max > 0) return Math.min(max, MAX_PAGE_SIZE);
			const fallback = queryLimit?.default;
			return typeof fallback === 'number' && fallback > 0 ? Math.min(fallback, MAX_PAGE_SIZE) : 100;
		}).catch((error: unknown) => {
			this.pageSize = undefined;
			throw error;
		});

		return await this.pageSize;
	}

	/** `path` is relative (no leading `/`), so it resolves below the configured base path. */
	async get<T>(path: string, decode: (data: unknown) => T, parameters?: URLSearchParams): Promise<T> {
		return decode(await this.request('GET', path, parameters));
	}

	async post<T>(path: string, decode: (data: unknown) => T, parameters: URLSearchParams, body: unknown): Promise<T> {
		return decode(await this.request('POST', path, parameters, body));
	}

	async patch<T>(path: string, decode: (data: unknown) => T, parameters: URLSearchParams, body: unknown): Promise<T> {
		return decode(await this.request('PATCH', path, parameters, body));
	}

	/** Directus answers a delete with `204` and no body. */
	async delete(path: string, body: unknown): Promise<void> {
		await this.withSlot(async () => {
			await this.send('DELETE', path, undefined, body);
		});
	}

	private async request(method: Method, path: string, parameters?: URLSearchParams, body?: unknown): Promise<unknown> {
		return await this.withSlot(async () => await this.parse(method, path, await this.send(method, path, parameters, body)));
	}

	private async parse(method: Method, path: string, response: Response): Promise<unknown> {
		let parsed: unknown;

		try {
			parsed = await response.json();
		}
		catch (error) {
			// The request's timeout also covers reading the answer.
			if (isTimeout(error)) throw timeoutError(method, path, error);
			throw new InvalidResponse(`Directus returned invalid JSON for ${method} ${path} (HTTP ${response.status}).`, { cause: error });
		}

		if (!isObject(parsed) || !('data' in parsed)) {
			throw new InvalidResponse(`Directus returned an invalid response envelope for ${method} ${path} (HTTP ${response.status}).`);
		}

		return parsed.data;
	}

	private async send(method: Method, path: string, parameters?: URLSearchParams, body?: unknown): Promise<Response> {
		if (path.startsWith('/')) throw new Error(`Directus endpoint paths are relative to the base URL, got \`${path}\`.`);

		const url = new URL(path, this.baseUrl);
		if (parameters !== undefined) url.search = parameters.toString();

		let response: Response;

		try {
			response = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${this.token}`,
					...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		}
		catch (error) {
			// The URL stays out of the message: it is configuration, not the caller's business.
			if (isTimeout(error)) throw timeoutError(method, path, error);
			throw new ConnectionFailed('Could not reach Directus.', { cause: error });
		}

		if (!response.ok) throw await failure(response, `${method} ${path}`);

		return response;
	}

	/** Holds one of the connection's slots while `work` sends a request and reads its answer. */
	private async withSlot<T>(work: () => Promise<T>): Promise<T> {
		const release = await this.acquire();

		try {
			return await work();
		}
		finally {
			release();
		}
	}

	/** A slot among the connection's in-flight requests; a release hands the slot to the next waiter. */
	private async acquire(): Promise<() => void> {
		if (this.inFlight < MAX_IN_FLIGHT) this.inFlight += 1;
		else await new Promise<void>((resolve) => this.waiting.push(resolve));

		return () => {
			const next = this.waiting.shift();
			if (next === undefined) this.inFlight -= 1;
			else next();
		};
	}
}

/**
 * Classifies a failed response by HTTP status first, since proxies in front of Directus answer
 * without its JSON body, then by Directus' `errors[0].extensions.code`. Directus' own messages can
 * quote the offending value, so they only travel as `cause`; the message names the code, collection
 * and field.
 */
async function failure(response: Response, request: string): Promise<Error> {
	const status = response.status;
	const { code, collection, field, rule, upstream } = await errorDetails(response);
	const options = upstream === undefined ? undefined : { cause: upstream };

	if (status === 429) return new RateLimited(`Directus rate limited the connector (${request}).`, options);

	if (status === 401 || status === 403) {
		// Directus also answers 403 for a collection or item the token cannot see, or that does not exist.
		return new AccessDenied(`Directus refused the token for ${request} (HTTP ${status}${code === undefined ? '' : `, ${code}`}); check the token and its role's permissions.`, options);
	}

	// Any 5xx, Directus' own internal errors included, is a server-side failure a retry may get past.
	if (status >= 500) {
		return new ConnectionFailed(`Directus failed or is unavailable (HTTP ${status}${code === undefined ? '' : `, ${code}`}) for ${request}.`, options);
	}

	const target = [collection, field].filter((part) => part !== undefined).join('.');
	const subject = target === '' ? 'the request' : `\`${target}\``;

	switch (code) {
		case 'RECORD_NOT_UNIQUE':
			return new UniqueConstraintViolation(`Directus refused the write: ${subject} must be unique.`, options);
		case 'NOT_NULL_VIOLATION':
			return new NullConstraintViolation(`Directus refused the write: ${subject} must not be empty.`, options);
		case 'INVALID_FOREIGN_KEY':
			return new ForeignKeyConstraintViolation(`Directus refused the write: ${subject} references a record that does not exist.`, options);
		case 'FAILED_VALIDATION':
			// Directus checks a field's `required` and validation rules before the database sees the row.
			return rule === 'nnull' || rule === 'required'
				? new NullConstraintViolation(`Directus refused the write: ${subject} must not be empty.`, options)
				: new QueryRejected(`Directus refused the write: the value for ${subject} fails its validation rule${rule === undefined ? '' : ` (${rule})`}.`, options);
		case 'VALUE_TOO_LONG':
		case 'VALUE_OUT_OF_RANGE':
			return new QueryRejected(`Directus refused the write: the value for ${subject} is outside the field's rule (${code}).`, options);
		case 'INVALID_PAYLOAD':
		case 'INVALID_QUERY':
			return new QueryRejected(`Directus refused ${request} as invalid (${code}).`, options);
		default:
			return new Error(`Directus request ${request} failed with HTTP ${status}${code === undefined ? '' : ` (${code})`}.`, options);
	}
}

interface ErrorDetails {
	code?: string | undefined;
	collection?: string | undefined;
	field?: string | undefined;
	/** `FAILED_VALIDATION`'s rule, such as `nnull` or `required`. */
	rule?: string | undefined;
	/** Directus' own error list, which may quote values; only ever attached as `cause`. */
	upstream?: unknown;
}

async function errorDetails(response: Response): Promise<ErrorDetails> {
	let body: unknown;

	try {
		body = await response.json();
	}
	catch {
		return {};
	}

	const errors = isObject(body) && Array.isArray(body.errors) ? body.errors : [];
	const [first] = errors;
	const extensions = isObject(first) && isObject(first.extensions) ? first.extensions : {};

	return {
		code: stringAt(extensions, 'code'),
		collection: stringAt(extensions, 'collection'),
		field: stringAt(extensions, 'field'),
		rule: stringAt(extensions, 'type'),
		upstream: errors.length === 0 ? undefined : errors,
	};
}

function stringAt(value: Record<string, unknown>, key: string): string | undefined {
	const candidate = value[key];
	return typeof candidate === 'string' ? candidate : undefined;
}

function isTimeout(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'TimeoutError';
}

function timeoutError(method: Method, path: string, cause: unknown): ConnectionFailed {
	return new ConnectionFailed(`Directus did not answer ${method} ${path} within ${REQUEST_TIMEOUT_MS / 1000} seconds.`, { cause });
}
