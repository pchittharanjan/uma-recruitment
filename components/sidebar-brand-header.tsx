'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

export function SidebarBrandHeader({
  href,
  tooltip,
  showExpandTooltip = true,
}: {
  href: string;
  tooltip?: string;
  showExpandTooltip?: boolean;
}) {
  return (
    <SidebarHeader className="shrink-0 p-2 pb-3">
      <div className="flex h-9 w-full items-center gap-2">
        <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
          <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              className="h-9 w-full justify-start gap-2.5"
              tooltip={tooltip}
              render={<Link href={href} />}
            >
              <BrandLogo />
              <span className="truncate text-[0.9375rem] font-semibold leading-none tracking-tight">
                Recruitment Hub
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarTrigger className="size-8 shrink-0 text-muted-foreground max-md:hidden group-data-[collapsible=icon]:hidden" />
      </div>
      <div className="mt-1 hidden justify-center group-data-[collapsible=icon]:flex max-md:hidden">
        <Tooltip>
          <TooltipTrigger render={<SidebarTrigger className="size-8 text-muted-foreground" />} />
          <TooltipContent side="right" align="center" hidden={!showExpandTooltip}>
            Expand Sidebar
            <kbd className="pointer-events-none ml-1.5 inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground">
              ⌘B
            </kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </SidebarHeader>
  );
}
