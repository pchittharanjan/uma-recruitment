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
  SearchIcon,
  Table2Icon,
  UploadIcon,
  UserCheckIcon,
  UsersIcon,
} from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  filterWorkspaceDestinations,
  normalizeWorkspaceHref,
  workspaceDestinations,
  type WorkspaceDestination,
} from '@/lib/workspace';
import { cn } from '@/lib/utils';

const DESTINATION_ICONS: Record<string, typeof LayoutDashboardIcon> = {
  Dashboard: LayoutDashboardIcon,
  Advancements: ListChecksIcon,
  Applications: Table2Icon,
  Users: UsersIcon,
  Overview: LayoutDashboardIcon,
  Home: LayoutDashboardIcon,
  'Your Teams': LayoutDashboardIcon,
  'Coffee Chats': CoffeeIcon,
  Application: FileTextIcon,
  'First Round Interview': MicIcon,
  'Final Round Interview': UserCheckIcon,
  Deliberations: LayoutGridIcon,
  Import: UploadIcon,
  Emails: MailIcon,
  'Final Selection': FlagIcon,
  Grading: FileTextIcon,
  Assignments: ListChecksIcon,
  Advancement: ListChecksIcon,
};

function iconForDestination(item: WorkspaceDestination) {
  const segment = item.title.split(' · ').pop() ?? item.title;
  for (const [key, Icon] of Object.entries(DESTINATION_ICONS)) {
    if (segment.includes(key)) return Icon;
  }
  return FileTextIcon;
}

export function PageSearch({ className }: { className?: string }) {
  const pathname = usePathname();
  const { area, teamNames, openTab } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const destinations = useMemo(
    () => workspaceDestinations(pathname, area, { teamNames }),
    [pathname, area, teamNames],
  );

  const filtered = useMemo(
    () => filterWorkspaceDestinations(destinations, query),
    [destinations, query],
  );

  const reset = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
  }, []);

  const handleSelect = useCallback(
    (href: string) => {
      openTab(href);
      setOpen(false);
      reset();
    },
    [openTab, reset],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, filtered.length]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[activeIndex];
      if (item) handleSelect(item.href);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      reset();
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          'hidden h-8 min-w-0 items-center gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 text-sm text-muted-foreground transition-colors md:flex',
          'hover:border-border hover:bg-background hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          className,
        )}
        onClick={() => setOpen(true)}
        title="Search pages (⌘K)"
      >
        <SearchIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">Search pages…</span>
        <kbd className="ml-1 hidden rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors md:hidden',
          'hover:bg-muted/50 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
        onClick={() => setOpen(true)}
        title="Search pages"
        aria-label="Search pages"
      >
        <SearchIcon className="size-4" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Search pages</DialogTitle>
            <DialogDescription>Jump to a page in the recruitment hub</DialogDescription>
          </DialogHeader>
          <div className="border-b border-border p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder="Search pages…"
                value={query}
                className="h-10 border-0 bg-muted/40 pl-9 shadow-none focus-visible:ring-0"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matching pages</p>
            ) : (
              filtered.map((item, index) => {
                const Icon = iconForDestination(item);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={normalizeWorkspaceHref(item.href)}
                    type="button"
                    data-index={index}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-muted/60',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(item.href)}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
