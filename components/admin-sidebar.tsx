'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminNavUser } from '@/components/admin-nav-user';
import { SidebarBrandHeader } from '@/components/sidebar-brand-header';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { SidebarPhaseNav } from '@/components/sidebar-phase-nav';
import { useAdminPhase } from '@/components/admin-phase-provider';
import { useIsClient, useBrowserSearch } from '@/hooks/use-workspace-embed';
import { isAdminDashboardPhase, parseDashboardViewPhase } from '@/lib/stages';
import type { RoundStatus } from '@/lib/db';
import { LayoutDashboardIcon, Table2Icon, UsersIcon, ListChecksIcon } from 'lucide-react';

const navItems = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboardIcon },
  { title: 'Advancements', href: '/admin/advancements', icon: ListChecksIcon },
  { title: 'Applications', href: '/admin/applications', icon: Table2Icon, requiresData: true as const },
  { title: 'Users', href: '/admin/users', icon: UsersIcon },
];

function isNavActive(
  pathname: string,
  href: string,
  dashboardViewPhase: RoundStatus | null,
): boolean {
  if (href === '/admin/dashboard') {
    if (pathname === '/admin/dashboard') {
      if (dashboardViewPhase && isAdminDashboardPhase(dashboardViewPhase)) {
        return false;
      }
      return true;
    }
    return (
      pathname.startsWith('/admin/teams/') && !pathname.startsWith('/admin/applications')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const search = useBrowserSearch();
  const { phase } = useAdminPhase();
  const mounted = useIsClient();

  const dashboardViewPhase =
    mounted && pathname === '/admin/dashboard' && phase?.status
      ? parseDashboardViewPhase(
          new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('view'),
          phase.status,
        )
      : null;

  const visibleNavItems = navItems.filter(
    (item) => !('requiresData' in item && item.requiresData) || showApplicationsNav,
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarBrandHeader href="/admin/dashboard" tooltip="Recruitment Hub" />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={isNavActive(pathname, item.href, dashboardViewPhase)}
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
