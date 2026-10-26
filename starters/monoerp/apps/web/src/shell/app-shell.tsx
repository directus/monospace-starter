import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useMatches, useNavigate } from '@tanstack/react-router'
import { House, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'

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
import { TooltipProvider } from '@/components/ui/tooltip'
import { refreshSession, SESSION_QUERY_KEY, signOut } from '@/lib/auth'
import { moduleById } from '@/modules'
import { usePages } from '@/modules/pages'
import { AppSidebar } from '@/shell/app-sidebar'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { CommandPalette } from '@/shell/command-palette'
import { appCopy } from '@/lib/app.copy'

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const session = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: refreshSession,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  )

  const [paletteOpen, setPaletteOpen] = useState(false)
  const isMobile = useIsMobile()

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
    localStorage.setItem('crm-theme', nextTheme)
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
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
          <Toaster position={isMobile ? 'bottom-center' : 'top-center'} />
          <PageContainer>{children}</PageContainer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
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
  const currentTitle = page?.title
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
        <BreadcrumbList className="max-sm:flex-nowrap">
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
                <BreadcrumbPage className="truncate">{currentTitle}</BreadcrumbPage>
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
