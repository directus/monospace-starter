import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { index, layout, physical, rootRoute, route } from '@tanstack/virtual-file-routes'

// Route files are relative to the routes directory, the repository root (tsr.config.json and
// vite.config.ts). Core pages are listed here; modules mount their own routes folders.
const root = fileURLToPath(new URL('../../', import.meta.url))

const modules = readdirSync(`${root}modules`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`${root}modules/${entry.name}/module.json`))
  .map((entry) => entry.name)
  .sort()

const core = (file: string) => `apps/web/src/routes/${file}`

// routes/app mounts at /<id>, routes/settings at /settings/<id>, routes/public at the site root.
const mounts = (kind: 'app' | 'settings' | 'public') =>
  modules.flatMap((id) =>
    existsSync(`${root}modules/${id}/routes/${kind}`)
      ? [physical(kind === 'public' ? '' : `/${id}`, `modules/${id}/routes/${kind}`)]
      : [],
  )

export const routes = rootRoute(core('__root.tsx'), [
  route('/login', core('login.tsx')),
  ...mounts('public'),
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
