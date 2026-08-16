'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TeamNavUser } from '@/components/team-nav-user';
import { TeamSidebarPhaseNav } from '@/components/team-sidebar-phase-nav';
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
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { teamOverviewHref } from '@/lib/stages';
import { ClipboardListIcon } from 'lucide-react';

function BrandLogo() {
  return (
    <div className="flex size-5 shrink-0 items-center justify-center">
      <Image
        src="/uma-logo.png"
        alt=""
        width={20}
        height={20}
        className="max-h-5 max-w-5 object-contain brightness-0"
      />
    </div>
  );
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
      <SidebarHeader className="shrink-0 gap-1 p-2 pb-3">
        <div className="flex w-full items-center gap-2 group-data-[collapsible=icon]:hidden">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-9 w-full justify-start gap-2.5 hover:bg-transparent active:bg-transparent"
                tooltip={mounted ? 'Recruitment Hub' : undefined}
                render={<Link href="/team" />}
              >
                <BrandLogo />
                <span className="truncate text-[0.9375rem] font-semibold leading-none tracking-tight">
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
                tooltip={mounted ? 'Recruitment Hub' : undefined}
                render={<Link href="/team" />}
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
            <TooltipContent side="right" align="center" hidden={!mounted}>
              Expand Sidebar
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarHeader>

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
                        tooltip={mounted ? `${team.name} — Overview` : undefined}
                        render={<Link href={teamHref} />}
                      >
                        <ClipboardListIcon />
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
