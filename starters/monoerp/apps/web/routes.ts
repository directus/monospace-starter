import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { index, layout, physical, rootRoute, route } from '@tanstack/virtual-file-routes'

// Route files are relative to tsr.config.json's routesDirectory, the repository root. Core pages
// are listed here; each module mounts its own routes/app and routes/settings folders.
const root = fileURLToPath(new URL('../../', import.meta.url))

const modules = readdirSync(`${root}modules`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`${root}modules/${entry.name}/module.json`))
  .map((entry) => entry.name)
  .sort()

const core = (file: string) => `apps/web/src/routes/${file}`

const mounts = (kind: 'app' | 'settings') =>
  modules.flatMap((id) =>
    existsSync(`${root}modules/${id}/routes/${kind}`)
      ? [physical(`/${id}`, `modules/${id}/routes/${kind}`)]
      : [],
  )

export const routes = rootRoute(core('__root.tsx'), [
  route('/login', core('login.tsx')),
  layout(core('_app.tsx'), [
    index(core('_app/index.tsx')),
    route('/settings', core('_app/settings.tsx'), [
      index(core('_app/settings.index.tsx')),
      route('/account', core('_app/settings.account.tsx')),
      ...mounts('settings'),
    ]),
    ...mounts('app'),
  ]),
])
