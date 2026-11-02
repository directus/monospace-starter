import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, loadEnv } from 'vite-plus'

import { moduleFeaturePaths } from './scripts/module-collections'
import { workspace } from './src/lib/workspace'

// The single .env lives at the repo root. Load it into process.env so server routes (which read
// process.env, not import.meta.env) see it in dev. In containers the env comes from the runtime.
const envDir = new URL('../../', import.meta.url).pathname

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, envDir, ''))

  const monospaceTarget =
    process.env.MONOSPACE_PROXY_TARGET ?? `http://localhost:${process.env.MONOSPACE_PORT ?? '8100'}`

  return {
    envDir,
    resolve: {
      dedupe: ['react', 'react-dom', '@tanstack/react-query', '@tanstack/react-router'],
      tsconfigPaths: true,
    },
    define: {
      __MODULE_FEATURE_PATHS__: JSON.stringify(moduleFeaturePaths),
    },
    // Fail rather than move to the next free port: another copy may already be on this one.
    server: { port: Number(process.env.APP_PORT ?? 3000), strictPort: true },
    plugins: [
      {
        // Module route folders sit outside this package, so Vite doesn't watch them for new
        // files. Watching them keeps the route tree generator informed about added routes.
        // The selected feature list above is read once per config load, so restart when a part
        // folder or manifest comes, goes, or changes (pnpm app:remove while pnpm dev runs), and
        // when pnpm install links an added part's packages.
        name: 'monoerp:watch-modules',
        configureServer(server) {
          const root = fileURLToPath(new URL('../../', import.meta.url))
          const part = /^((modules|connectors)\/[^/]+(\/(module|connector)\.json)?|pnpm-lock\.yaml)$/
          let timer: ReturnType<typeof setTimeout> | undefined

          server.watcher.add([`${root}modules/`, `${root}connectors/`, `${root}pnpm-lock.yaml`])

          const onPartChange = (_event: string, file: string) => {
            const path = relative(root, file).split(sep).join('/')

            if (!part.test(path)) return

            clearTimeout(timer)
            timer = setTimeout(() => {
              server.config.logger.info(`${path} changed, restarting to pick up parts`)
              void server.restart()
            }, 300)
          }

          server.watcher.on('all', onPartChange)
        },
      },
      devtools(),
      nitro({
        // Without this the server bundle can split the router into chunks that import each other,
        // so a module's top-level code runs before its imports exist and the server 500s on boot.
        rolldownConfig: { output: { strictExecutionOrder: true } },
        routes: {
          '/logo/:domain': './server/logo.ts',
          '/api/system/assets/:id': './server/asset.ts',
          [`/api/${encodeURIComponent(workspace)}/assets/**`]: './server/asset.ts',
        },
        devProxy: {
          '/api/**': { target: monospaceTarget, changeOrigin: true },
        },
        routeRules: {
          '/api/**': { proxy: `${monospaceTarget}/api/**` },
        },
      }),
      tailwindcss(),
      tanstackStart({
        // Route files live in apps/web/src/routes and in each modules/*/routes; routes.ts maps
        // both from the repository root. tsr.config.json repeats this for `tsr generate`.
        router: { routesDirectory: '../../../', virtualRouteConfig: './routes.ts' },
      }),
      viteReact({ compiler: true }),
    ],
  }
})
