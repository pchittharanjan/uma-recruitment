'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TeamNavUser } from '@/components/team-nav-user';
import { SidebarBrandHeader } from '@/components/sidebar-brand-header';
import { TeamSidebarPhaseNav } from '@/components/team-sidebar-phase-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { teamOverviewHref } from '@/lib/stages';
import { teamDotClass } from '@/lib/team-colors';
import { cn } from '@/lib/utils';
import { ClipboardListIcon } from 'lucide-react';

export function TeamSidebar({
  user,
  teams,
  isImpersonating = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; role: string };
  teams: { id: number; name: string }[];
  isImpersonating?: boolean;
}) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarBrandHeader
        href="/team"
        tooltip={mounted ? 'Recruitment Hub' : undefined}
        showExpandTooltip={mounted}
      />

      <SidebarContent>
        {teams.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Teams</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {teams.map((team) => {
                  const teamHref = teamOverviewHref(team.id);
                  const teamActive =
                    mounted &&
                    (pathname === teamHref ||
                      (pathname.startsWith(`${teamHref}/`) &&
                        !pathname.startsWith(`${teamHref}/advancement`)));

                  return (
                    <SidebarMenuItem key={team.id}>
                      <SidebarMenuButton
                        isActive={teamActive}
                        tooltip={mounted ? `${team.name} - Overview` : undefined}
                        render={<Link href={teamHref} />}
                      >
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            teamDotClass(team.name),
                          )}
                          aria-hidden
                        />
                        <span>{team.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <TeamSidebarPhaseNav teams={teams} />
      </SidebarContent>

      <SidebarFooter>
        <TeamNavUser user={user} isImpersonating={isImpersonating} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
