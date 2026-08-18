'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  CoffeeIcon,
  FileTextIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MailIcon,
  MicIcon,
  PlusIcon,
  Table2Icon,
  UploadIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { normalizeWorkspaceHref, workspaceDestinations } from '@/lib/workspace';
import { cn } from '@/lib/utils';

const DESTINATION_ICONS: Record<string, typeof LayoutDashboardIcon> = {
  Dashboard: LayoutDashboardIcon,
  Advancements: ListChecksIcon,
  Applications: Table2Icon,
  Users: UsersIcon,
  Overview: LayoutDashboardIcon,
  Home: LayoutDashboardIcon,
  'Coffee Chats': CoffeeIcon,
  Application: FileTextIcon,
  'First Round Interview': MicIcon,
  'Final Round Interview': UserCheckIcon,
  Deliberations: LayoutGridIcon,
  Import: UploadIcon,
  Emails: MailIcon,
  'Final Selection': FlagIcon,
};
const HOVER_CLOSE_DELAY_MS = 150;

export function WorkspaceNewTabMenu({
  className,
  currentHref,
  onSelect,
}: {
  className?: string;
  /** When null, no page is considered selected (e.g. empty split pane). */
  currentHref?: string | null;
  onSelect?: (href: string) => void;
}) {
  const pathname = usePathname();
  const { area, tabs, activeHref, openTab } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Explicit null means empty pane — do not fall back to the left/active href.
  const selectedHref = currentHref === undefined ? activeHref : currentHref;

  const destinations = useMemo(() => workspaceDestinations(pathname, area), [pathname, area]);
  const openHrefs = useMemo(
    () => new Set(tabs.map((tab) => normalizeWorkspaceHref(tab.href))),
    [tabs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((item) => item.title.toLowerCase().includes(q));
  }, [destinations, query]);

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const openOnHover = useCallback(() => {
    clearHoverCloseTimer();
    setOpen(true);
  }, [clearHoverCloseTimer]);

  const scheduleCloseOnHoverLeave = useCallback(() => {
    clearHoverCloseTimer();
    hoverCloseTimer.current = setTimeout(() => {
      setOpen(false);
      setQuery('');
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearHoverCloseTimer]);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  const handleSelect = (href: string) => {
    const normalized = normalizeWorkspaceHref(href);
    if (
      selectedHref != null &&
      normalized === normalizeWorkspaceHref(selectedHref)
    ) {
      return;
    }
    if (onSelect) {
      onSelect(href);
    } else {
      openTab(href);
    }
    setOpen(false);
    setQuery('');
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              'shrink-0 text-muted-foreground hover:text-foreground',
              className,
            )}
            title="Open another page"
            onMouseEnter={openOnHover}
            onMouseLeave={scheduleCloseOnHoverLeave}
          />
        }
      >
        <PlusIcon data-icon="inline-start" className="size-3.5" />
        Open
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-56 p-0"
        onMouseEnter={openOnHover}
        onMouseLeave={scheduleCloseOnHoverLeave}
      >
        <div className="p-2">
          <Input
            placeholder="Open a page…"
            value={query}
            className="h-8 border-0 bg-muted/50 shadow-none focus-visible:ring-0"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <DropdownMenuItem disabled>No matching pages</DropdownMenuItem>
          ) : (
            filtered.map((item) => {
              const Icon = DESTINATION_ICONS[item.title] ?? FileTextIcon;
              const isOpen = openHrefs.has(normalizeWorkspaceHref(item.href));
              return (
                <DropdownMenuItem
                  key={item.href}
                  disabled={
                    selectedHref != null &&
                    normalizeWorkspaceHref(item.href) ===
                      normalizeWorkspaceHref(selectedHref)
                  }
                  onClick={() => handleSelect(item.href)}
                >
                  <Icon data-icon="inline-start" className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {isOpen ? (
                    <span className="text-xs text-muted-foreground">Open</span>
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
