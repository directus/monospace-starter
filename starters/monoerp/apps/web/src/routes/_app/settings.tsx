import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Settings, UserRound } from 'lucide-react'

import { Fragment } from 'react'

import { modules } from '@/modules'
import { usePages } from '@/modules/pages'
import { settingsCopy } from '@/settings/settings.copy'

export const Route = createFileRoute('/_app/settings')({
  staticData: {
    page: { title: settingsCopy.title, icon: Settings, keywords: settingsCopy.keywords },
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  const pages = usePages()

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-12">
      <aside className="shrink-0 lg:w-44">
        <h2 className="text-lg font-semibold tracking-tight">{settingsCopy.title}</h2>
        <nav
          aria-label={settingsCopy.title}
          className="mt-3 flex gap-1 overflow-x-auto lg:mt-6 lg:block lg:space-y-2"
        >
          <p className="hidden px-2 text-xs font-medium text-muted-foreground lg:block">
            {settingsCopy.account.title}
          </p>
          <Link
            to="/settings/account"
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted max-lg:shrink-0 max-lg:px-3 max-lg:whitespace-nowrap"
            activeProps={{ className: 'bg-muted font-medium', 'aria-current': 'page' }}
          >
            <UserRound className="size-4 text-muted-foreground" />
            {settingsCopy.account.profileTitle}
          </Link>
          {modules.map((module) =>
            module.settings ? (
              <Fragment key={module.id}>
                <p className="hidden px-2 pt-2 text-xs font-medium text-muted-foreground lg:block">
                  {module.settings.title}
                </p>
                {module.settings.pages.flatMap((to) => {
                  const page = pages.find((page) => page.to === to)

                  return page
                    ? [
                        <Link
                          key={page.to}
                          to={page.to}
                          className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted max-lg:shrink-0 max-lg:px-3 max-lg:whitespace-nowrap"
                          activeProps={{
                            className: 'bg-muted font-medium',
                            'aria-current': 'page',
                          }}
                        >
                          {page.icon ? (
                            <page.icon className="size-4 text-muted-foreground" />
                          ) : null}
                          {page.title}
                        </Link>,
                      ]
                    : []
                })}
              </Fragment>
            ) : null,
          )}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
