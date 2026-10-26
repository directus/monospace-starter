import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight, House, Settings } from 'lucide-react'

import { NavUser } from '@/shell/nav-user'
import { useNavGroups } from '@/shell/use-nav-groups'
import type { CurrentUser } from '@/lib/auth'
import { modules } from '@/modules'
import { usePages } from '@/modules/pages'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { appCopy } from '@/lib/app.copy'
import { settingsCopy } from '@/settings/settings.copy'

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user?: CurrentUser
  theme: 'light' | 'dark'
  isSigningOut: boolean
  signOutError?: string
  onSignOut: () => void
  onThemeChange: (theme: 'light' | 'dark') => void
}

export function AppSidebar({
  user,
  theme,
  isSigningOut,
  signOutError,
  onSignOut,
  onThemeChange,
  ...props
}: AppSidebarProps) {
  const location = useLocation()
  const { setOpenMobile, state, isMobile } = useSidebar()
  const pages = usePages()
  const iconMode = state === 'collapsed' && !isMobile

  const activeModule = modules.find(
    (module) =>
      location.pathname === module.basePath || location.pathname.startsWith(`${module.basePath}/`),
  )?.id

  const groups = useNavGroups(activeModule, location.pathname)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={appCopy.app.name}
              className="group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:w-8!"
              render={<Link to="/" />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
                M
              </div>
              <span className="truncate font-semibold">{appCopy.app.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location.pathname === '/'}
                  tooltip={appCopy.home.title}
                  className="gap-3 [&>svg]:size-[18px]"
                  render={<Link to="/" onClick={() => setOpenMobile(false)} />}
                >
                  <House />
                  <span>{appCopy.home.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {modules.map((module) => (
          <SidebarGroup key={module.id}>
            <Collapsible
              // The icon-only rail has no labels to click, so every page icon stays visible.
              open={iconMode || groups.isOpen(module.id)}
              disabled={iconMode}
              onOpenChange={(open) => groups.setOpen(module.id, open)}
            >
              <SidebarGroupLabel
                render={<CollapsibleTrigger />}
                className="group/label w-full cursor-pointer text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {module.label}
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-panel-open/label:rotate-90 motion-reduce:transition-none" />
              </SidebarGroupLabel>
              <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {pages
                      .filter((page) => page.module === module.id && page.nav !== undefined)
                      .map(({ to, title, icon: Icon }) => (
                        <SidebarMenuItem key={to}>
                          <SidebarMenuButton
                            isActive={
                              to === module.basePath
                                ? location.pathname === to
                                : location.pathname === to || location.pathname.startsWith(`${to}/`)
                            }
                            tooltip={title}
                            className="gap-3 [&>svg]:size-[18px]"
                            render={<Link to={to} onClick={() => setOpenMobile(false)} />}
                          >
                            {Icon ? <Icon /> : null}
                            <span>{title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={settingsCopy.title}
              isActive={location.pathname.startsWith('/settings')}
              render={<Link to="/settings" onClick={() => setOpenMobile(false)} />}
            >
              <Settings />
              <span>{settingsCopy.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser
          user={user}
          theme={theme}
          isSigningOut={isSigningOut}
          signOutError={signOutError}
          onSignOut={onSignOut}
          onThemeChange={onThemeChange}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
