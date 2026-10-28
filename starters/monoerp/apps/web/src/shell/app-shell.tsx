import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useMatches, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { House, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { appCopy } from '@/lib/app.copy'
import { sessionQuery, signOut } from '@/lib/auth'
import { appStorageKey } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { moduleById } from '@/modules'
import { usePages } from '@/modules/pages'
import { AppSidebar } from '@/shell/app-sidebar'
import { CommandPalette } from '@/shell/command-palette'
import { PageBreadcrumb } from '@/shell/page-breadcrumb'

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const session = useQuery(sessionQuery())

  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  )

  const [paletteOpen, setPaletteOpen] = useState(false)
  const isMobile = useIsMobile()

  usePreloadModulePages()

  const logout = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: '/login' })
    },
  })

  function changeTheme(nextTheme: 'light' | 'dark') {
    const root = document.documentElement

    root.dataset.themeChanging = ''
    root.classList.toggle('dark', nextTheme === 'dark')
    localStorage.setItem(appStorageKey('theme'), nextTheme)
    setTheme(nextTheme)

    void root.offsetWidth
    window.setTimeout(() => delete root.dataset.themeChanging, 0)
  }

  return (
    <TooltipProvider delay={300}>
      <SidebarProvider>
        <AppSidebar
          user={session.data}
          theme={theme}
          isSigningOut={logout.isPending}
          signOutError={logout.isError ? logout.error.message : undefined}
          onSignOut={() => logout.mutate()}
          onThemeChange={changeTheme}
        />
        <SidebarInset className="h-svh overflow-hidden">
          <AppHeader onOpenSearch={() => setPaletteOpen(true)} />
          <NavigationProgress />
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <Toaster position={isMobile ? 'bottom-center' : 'top-center'} />
          <PageContainer>{children}</PageContainer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

const PRELOAD_DELAY = 1500

// Once the first page is up and the browser is idle, fetch the code for the module pages (lists,
// dashboards, record pages) so a first visit doesn't wait on a download. Their data still loads
// on hover or click.
function usePreloadModulePages() {
  const router = useRouter()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const route of Object.values(router.routesById)) {
        if (route.options.staticData?.page?.module) void router.loadRouteChunk(route)
      }
    }, PRELOAD_DELAY)

    return () => window.clearTimeout(timer)
  }, [router])
}

// Loaders hold the current page until the next one has its data. A thin bar under the header shows
// that a click registered; it fades in late, so instant (cached or preloaded) navigations don't flash.
function NavigationProgress() {
  const loading = useRouterState({ select: (state) => state.isLoading })

  return (
    <div className="pointer-events-none relative z-20 h-0" aria-hidden>
      {loading ? (
        <div className="absolute inset-x-0 top-0 h-0.5 [animation:reveal_150ms_ease-out_150ms_forwards] overflow-hidden opacity-0">
          <div className="h-full w-1/3 bg-primary motion-safe:[animation:route-progress_1s_ease-in-out_infinite]" />
        </div>
      ) : null}
    </div>
  )
}

// The page scrolls inside this wrapper so a board can fill the remaining viewport height.
function PageContainer({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const match = matches.at(-1)
  const page = match?.staticData.page
  const fullWidth = page?.fullWidth ?? false
  // A page that failed shows the route error, which needs the usual padding.
  const fill = (page?.fill ?? false) && match?.status !== 'error'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          'mx-auto flex w-full flex-col',
          fill ? 'h-full overflow-hidden' : 'min-h-full p-4 sm:p-6 lg:p-8',
          !fullWidth && 'max-w-[1440px]',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const matches = useMatches()
  const pages = usePages()
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar()
  const sidebarOpen = isMobile ? openMobile : state === 'expanded'
  const currentMatch = matches.at(-1)
  const page = currentMatch?.staticData.page
  const module = page ? moduleById(page.module) : undefined
  const parent = page?.parent ? pages.find((item) => item.to === page.parent) : undefined

  const isModuleHome = module
    ? matches.at(-1)?.fullPath.replace(/\/$/, '') === module.basePath
    : false

  const isHome = matches.at(-1)?.fullPath === '/'
  const hasLeaf = page && !isModuleHome
  // Phones keep only home and the current page so the header stays one line.
  const middleCrumb = hasLeaf ? 'max-sm:hidden' : undefined

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-backdrop-filter:bg-background/75">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={sidebarOpen ? appCopy.sidebar.collapse : appCopy.sidebar.expand}
        aria-expanded={sidebarOpen}
        onClick={toggleSidebar}
      >
        {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
      <Separator
        orientation="vertical"
        className="mx-2 h-6 bg-foreground/15 data-vertical:self-center"
      />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem>
            {isHome ? (
              <BreadcrumbPage>
                <House className="size-4" />
                <span className="sr-only">{appCopy.home.title}</span>
              </BreadcrumbPage>
            ) : (
              <BreadcrumbLink render={<Link to="/" aria-label={appCopy.home.title} />}>
                <House className="size-4" />
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {module ? (
            <>
              <BreadcrumbSeparator className={middleCrumb} />
              <BreadcrumbItem className={middleCrumb}>
                {isModuleHome ? (
                  <BreadcrumbPage>{module.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={module.basePath} />}>
                    {module.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          ) : null}
          {parent ? (
            <>
              <BreadcrumbSeparator className={middleCrumb} />
              <BreadcrumbItem className={middleCrumb}>
                <BreadcrumbLink render={<Link to={parent.to} />}>{parent.title}</BreadcrumbLink>
              </BreadcrumbItem>
            </>
          ) : null}
          {hasLeaf ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <PageBreadcrumb page={page} params={currentMatch.params} />
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto gap-2 text-muted-foreground sm:w-56 sm:justify-start"
        onClick={onOpenSearch}
      >
        <Search />
        <span className="hidden sm:inline">{appCopy.search.trigger}</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
          {appCopy.search.shortcut}
        </kbd>
      </Button>
    </header>
  )
}
