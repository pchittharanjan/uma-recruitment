'use client';

import type { LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function firstNameInitial(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return (first?.[0] ?? '?').toUpperCase();
}

export function SidebarNavUser({
  user,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
}: {
  user: { name: string; email: string };
  actionLabel: string;
  actionIcon: LucideIcon;
  onAction: () => void;
}) {
  const initial = firstNameInitial(user.name);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex h-12 items-center gap-2 overflow-hidden rounded-md px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <Avatar className="size-8 rounded-lg group-data-[collapsible=icon]:hidden">
            <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-normal">{user.name}</span>
            <span className="truncate text-xs normal-case text-muted-foreground">{user.email}</span>
          </div>
          <Tooltip>
            <TooltipTrigger
              type="button"
              onClick={onAction}
              aria-label={actionLabel}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <ActionIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {actionLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
