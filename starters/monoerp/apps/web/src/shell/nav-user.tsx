import { ChevronsUpDown, LogOut, Moon, Sun } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import type { CurrentUser } from '@/lib/auth'
import { appCopy } from '@/lib/app.copy'
import { initials } from '@/lib/format'
import { avatarUrl } from '@/lib/users'

export function NavUser({
  user,
  theme,
  isSigningOut,
  signOutError,
  onSignOut,
  onThemeChange,
}: {
  user?: CurrentUser
  theme: 'light' | 'dark'
  isSigningOut: boolean
  signOutError?: string
  onSignOut: () => void
  onThemeChange: (theme: 'light' | 'dark') => void
}) {
  const { isMobile } = useSidebar()
  const displayName = user?.fullName?.trim() || user?.email || appCopy.auth.defaultUser
  const email = user?.email ?? appCopy.auth.loadingProfile

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:w-8!"
              />
            }
          >
            <Avatar>
              {user?.avatarId ? (
                <AvatarImage src={avatarUrl(user.avatarId)} alt={displayName} />
              ) : null}
              <AvatarFallback>{initials(displayName, 'M')}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{appCopy.auth.appearance}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => {
                  if (value === 'light' || value === 'dark') onThemeChange(value)
                }}
              >
                <DropdownMenuRadioItem value="light">
                  <Sun />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <Moon />
                  Dark
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={isSigningOut} onClick={onSignOut}>
              <LogOut />
              {isSigningOut ? appCopy.auth.signingOut : appCopy.auth.signOut}
            </DropdownMenuItem>
            {signOutError ? (
              <p className="px-1.5 py-1 text-xs text-destructive" role="alert">
                {signOutError}
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
