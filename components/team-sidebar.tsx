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
import { isTeamOverviewPath, teamOverviewHref } from '@/lib/stages';
import { cn } from '@/lib/utils';
import { LayoutDashboardIcon } from 'lucide-react';

function extractTeamId(pathname: string): number | null {
  const match = pathname.match(/^\/team\/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function teamSidebarActiveClass(teamName: string): string {
  // Match admin "team color" language: Strategy=orange, Events=blue, Design=purple/violet.
  // Keep it subtle so it blends with the sidebar surface.
  if (teamName === 'Strategy') return 'bg-orange-500/12 text-orange-800';
  if (teamName === 'Events') return 'bg-blue-500/12 text-blue-800';
  if (teamName === 'Design') return 'bg-violet-500/12 text-violet-800';
  return 'bg-primary/10 text-foreground';
}

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
                    mounted && isTeamOverviewPath(pathname) &&
                    extractTeamId(pathname) === team.id;

                  return (
                    <SidebarMenuItem key={team.id}>
                      <SidebarMenuButton
                        isActive={teamActive}
                        className={cn(teamActive && teamSidebarActiveClass(team.name))}
                        tooltip={mounted ? `${team.name} - Overview` : undefined}
                        render={<Link href={teamHref} />}
                      >
                        <LayoutDashboardIcon className="size-4 shrink-0" />
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
