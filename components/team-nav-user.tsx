'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { EllipsisVerticalIcon, LogOutIcon, Undo2Icon } from 'lucide-react';

function firstNameInitial(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return (first?.[0] ?? '?').toUpperCase();
}

export function TeamNavUser({
  user,
  isImpersonating = false,
}: {
  user: { name: string; email: string; role: string };
  isImpersonating?: boolean;
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const initial = firstNameInitial(user.name);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const handleExitTestMode = async () => {
    await fetch('/api/admin/impersonate/stop', { method: 'POST' });
    router.push('/admin/dashboard');
    router.refresh();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {isImpersonating && (
                <DropdownMenuItem onClick={handleExitTestMode}>
                  <Undo2Icon />
                  Exit test mode
                </DropdownMenuItem>
              )}
              {!isImpersonating && (
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOutIcon />
                  Sign Out
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
