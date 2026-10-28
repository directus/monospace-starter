import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { appCopy } from '@/lib/app.copy'
import { sessionQuery } from '@/lib/auth'
import { modules } from '@/lib/modules'
import { usePages } from '@/lib/modules/pages'

export const Route = createFileRoute('/_app/')({
  component: HomePage,
})

function HomePage() {
  const session = useQuery(sessionQuery())

  const name = session.data?.fullName?.split(' ')[0] ?? session.data?.email
  const pages = usePages()

  return (
    <div className="space-y-6">
      <PageHeader title={appCopy.home.welcome(name)} description={appCopy.home.description} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <module.icon className="size-4 text-muted-foreground" />
                {module.label}
              </CardTitle>
              <CardDescription>{module.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {pages
                .filter((page) => page.module === module.id && page.nav !== undefined)
                .map((page) => (
                  <Link
                    key={page.to}
                    to={page.to}
                    className="group flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      {page.icon ? <page.icon className="size-4 text-muted-foreground" /> : null}
                      {page.title}
                    </span>
                    <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
