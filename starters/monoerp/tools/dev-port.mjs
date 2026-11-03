// Vite binds `localhost`, which is ::1 only on macOS, so its strictPort misses an app on
// 127.0.0.1 and the browser can reach either one. Check both loopbacks before starting.
import { existsSync } from 'node:fs'

import { repository } from '../infra/manifests.mjs'
import { listening } from './env.mjs'

const envFile = new URL('.env', repository)

if (existsSync(envFile)) process.loadEnvFile(envFile)

const port = Number(process.env.APP_PORT ?? 3000)

if (await listening(port)) {
  const lookup =
    process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -i :${port}`

  console.error(
    [
      `Port ${port} (APP_PORT) is taken. See what: ${lookup}`,
      'Fix: stop it, or change APP_PORT in .env.',
    ].join('\n'),
  )
  process.exit(1)
}
