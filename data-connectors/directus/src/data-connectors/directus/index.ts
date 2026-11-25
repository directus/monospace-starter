import type { SchemaDocument } from '@monospace/extension-kit/data-connector';
import { defineDataConnector } from '@monospace/extension-kit/data-connector';
import { DirectusClient } from './client';
import { parseConfig } from './config';
import { executeQuery } from './query';
import { introspectDirectus } from './schema';

export default defineDataConnector<unknown>({
	preflight({ config: rawConfig }) {
		const { baseUrl } = parseConfig(rawConfig);
		// `host` carries the port only when the URL names a non-default one.
		return { permissions: [{ permission: `net:${baseUrl.host}`, reason: 'Directus API' }] };
	},

	setup({ config: rawConfig }) {
		const config = parseConfig(rawConfig);
		const client = new DirectusClient(config.baseUrl, config.token);
		let currentSchema: SchemaDocument | undefined;
		const schema = async () => currentSchema ??= await introspectDirectus(client, config);

		return {
			async introspect() {
				currentSchema = await introspectDirectus(client, config);
				return currentSchema;
			},

			async query(request) {
				return await executeQuery({ client, config, schema: await schema() }, request);
			},

			async testConnection() {
				await client.get('collections', () => {});
				return { ok: true };
			},
		};
	},
});
