import { defineDataConnector } from '@monospace/extension-kit/data-connector'
import { StripeClient } from './client'
import { stripeSchema } from './collections'
import { apiBasePermission, parseConfig } from './config'
import { executeQuery } from './query'

export default defineDataConnector<unknown>({
  preflight({ config: rawConfig }) {
    const permission = apiBasePermission(parseConfig(rawConfig).apiBase)

    return {
      permissions:
        permission === undefined
          ? []
          : [{ permission, reason: 'Reach the configured Stripe API base' }],
    }
  },

  setup({ config: rawConfig }) {
    const config = parseConfig(rawConfig)
    const context = { client: new StripeClient(config.apiKey, config.apiBase), config }
    const schema = stripeSchema(config.enableWrites)

    return {
      introspect() {
        return schema.toSchemaDocument()
      },

      async query(request) {
        return await executeQuery(context, request)
      },

      async testConnection() {
        await context.client.ping()

        return { ok: true }
      },
    }
  },
})
