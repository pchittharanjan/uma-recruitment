'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellIcon } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cachedJsonFetch, invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { cn } from '@/lib/utils';

type NotificationItem = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  teamId: number | null;
  readAt: number | null;
  createdAt: number;
};

/** Badge poll only — keep this sparse so Turso isn't woken constantly. */
const COUNT_POLL_MS = 3 * 60_000;
/** Don't re-hit count on focus if we polled recently. */
const FOCUS_MIN_GAP_MS = 60_000;
/** Grace period when moving from trigger to portaled panel. */
const HOVER_CLOSE_DELAY_MS = 150;

function formatRelativeTime(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function NotificationBell() {
  const { openTab } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const lastCountAt = useRef(0);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    hoverCloseTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }, [clearHoverCloseTimer]);

  const loadCount = useCallback(async (force = false) => {
    if (document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (!force && now - lastCountAt.current < FOCUS_MIN_GAP_MS) return;

    try {
      const { ok, json } = await cachedJsonFetch<{ unreadCount?: number }>(
        '/api/notifications?countOnly=1',
        {
          force,
          ttlMs: COUNT_POLL_MS,
          staleMs: 15 * 60_000,
        },
      );
      if (!ok || !json || !mountedRef.current) return;
      lastCountAt.current = Date.now();
      setUnreadCount(json.unreadCount ?? 0);
    } catch {
      // Ignore transient network errors; next poll retries.
    }
  }, []);

  const loadList = useCallback(async () => {
    try {
      const { ok, json } = await cachedJsonFetch<{
        notifications?: NotificationItem[];
        unreadCount?: number;
      }>('/api/notifications', { force: true, ttlMs: 30_000 });
      if (!ok || !json || !mountedRef.current) return;
      setItems(json.notifications ?? []);
      setUnreadCount(json.unreadCount ?? 0);
      lastCountAt.current = Date.now();
    } catch {
      // Ignore transient network errors.
    }
  }, []);

  useEffect(() => {
    void loadCount(true);

    const id = window.setInterval(() => void loadCount(true), COUNT_POLL_MS);

    const onFocus = () => void loadCount(false);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadCount(false);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadCount]);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  useEffect(() => {
    if (open) void loadList();
  }, [open, loadList]);

  const markRead = async (id: number) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: Date.now() / 1000 } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', id }),
      });
      invalidateClientFetchCache('/api/notifications');
    } catch {
      void loadList();
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() / 1000 })));
    setUnreadCount(0);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all' }),
      });
      invalidateClientFetchCache('/api/notifications');
    } catch {
      void loadList();
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const onItemClick = async (item: NotificationItem) => {
    if (item.readAt == null) await markRead(item.id);
    setOpen(false);
    if (item.href) openTab(item.href);
  };

  const badge =
    unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="relative shrink-0 text-muted-foreground"
            aria-label={
              badge ? `Notifications, ${unreadCount} unread` : 'Notifications'
            }
            onMouseEnter={openOnHover}
            onMouseLeave={scheduleCloseOnHoverLeave}
          />
        }
      >
        <BellIcon className="size-4" />
        {badge ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground">
            {badge}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
        onMouseEnter={openOnHover}
        onMouseLeave={scheduleCloseOnHoverLeave}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="font-heading text-sm font-medium text-foreground">Notifications</p>
          {unreadCount > 0 ? (
            <button
              type="button"
              disabled={loading}
              className="font-heading text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {items.length === 0 ? (
            <p className="font-heading px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          ) : (
            <ul className="py-1.5">
              {items.map((item) => {
                const unread = item.readAt == null;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        'uma-hover-on-panel flex w-full flex-col gap-1 px-4 py-3.5 text-left normal-case',
                        'focus-visible:bg-accent focus-visible:outline-none',
                        unread && 'bg-muted/40',
                      )}
                      onClick={() => void onItemClick(item)}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span
                          className={cn(
                            'font-heading text-sm leading-snug',
                            unread ? 'font-medium text-foreground' : 'text-foreground',
                          )}
                        >
                          {item.title}
                        </span>
                        {unread ? (
                          <span
                            aria-hidden
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                          />
                        ) : null}
                      </span>
                      {item.body ? (
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {item.body}
                        </span>
                      ) : null}
                      <span className="mt-0.5 text-[0.7rem] text-muted-foreground/70">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
