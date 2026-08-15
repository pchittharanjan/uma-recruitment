'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminNavUser } from '@/components/admin-nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SidebarPhaseNav } from '@/components/sidebar-phase-nav';
import { LayoutDashboardIcon, Table2Icon, UsersIcon, ListChecksIcon } from 'lucide-react';

const navItems = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboardIcon },
  { title: 'Advancements', href: '/admin/advancements', icon: ListChecksIcon },
  { title: 'Applications', href: '/admin/applications', icon: Table2Icon, requiresData: true as const },
  { title: 'Users', href: '/admin/users', icon: UsersIcon },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/admin/dashboard') {
    return (
      pathname === '/admin/dashboard' ||
      (pathname.startsWith('/admin/teams/') && !pathname.startsWith('/admin/applications'))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandLogo() {
  return (
    <div className="flex size-4 shrink-0 items-center justify-center">
      <Image
        src="/uma-logo.png"
        alt=""
        width={16}
        height={16}
        className="max-h-4 max-w-4 object-contain brightness-0"
      />
    </div>
  );
}

export function AdminSidebar({
  user,
  showApplicationsNav = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; role: string };
  showApplicationsNav?: boolean;
}) {
  const pathname = usePathname();

  const visibleNavItems = navItems.filter(
    (item) => !('requiresData' in item && item.requiresData) || showApplicationsNav,
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="shrink-0 gap-1 p-2">
        <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:hidden">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-8 w-full justify-start gap-2 hover:bg-transparent active:bg-transparent"
                tooltip="Recruitment Hub"
                render={<Link href="/admin/dashboard" />}
              >
                <BrandLogo />
                <span className="truncate text-sm font-semibold leading-none tracking-tight">
                  Recruitment Hub
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger className="size-8 shrink-0 text-muted-foreground max-md:hidden" />
        </div>

        <div className="hidden w-full flex-col gap-1 group-data-[collapsible=icon]:flex">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="hover:bg-transparent active:bg-transparent"
                tooltip="Recruitment Hub"
                render={<Link href="/admin/dashboard" />}
              >
                <BrandLogo />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarTrigger className="size-8 text-muted-foreground max-md:hidden" />
              }
            />
            <TooltipContent side="right" align="center">
              Expand Sidebar
              <kbd className="pointer-events-none ml-1.5 inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
                ⌘B
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isNavActive(pathname, item.href)}
                    tooltip={item.title}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarPhaseNav />
      </SidebarContent>

      <SidebarFooter>
        <AdminNavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
