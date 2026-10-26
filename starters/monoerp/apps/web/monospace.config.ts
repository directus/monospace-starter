import { defineConfig } from '@monospace/sdk/config'

// Reads the trimmed document `scripts/fetch-openapi.ts` writes, not the server directly.
export default defineConfig({
  input: './monospace.openapi.json',
  output: './src/generated/monospace',
})
