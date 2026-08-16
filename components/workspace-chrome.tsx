'use client';

import { useRef } from 'react';
import { Columns2Icon, XIcon } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { WorkspaceNewTabMenu } from '@/components/workspace-new-tab-menu';
import { Button } from '@/components/ui/button';
import { withEmbedParam, type WorkspaceTab } from '@/lib/workspace';
import { cn } from '@/lib/utils';

function tabDomId(prefix: string, href: string) {
  return `${prefix}-${href.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function WorkspaceTabBar({
  tabs,
  activeHref,
  canClose,
  idPrefix,
  ariaLabel,
  onSelect,
  onClose,
  newTabMenu,
}: {
  tabs: WorkspaceTab[];
  activeHref: string | null;
  canClose: boolean;
  idPrefix: string;
  ariaLabel: string;
  onSelect: (href: string) => void;
  onClose: (href: string) => void;
  newTabMenu: React.ReactNode;
}) {
  const focusTabAt = (index: number) => {
    const next = tabs[index];
    if (!next) return;
    onSelect(next.href);
    requestAnimationFrame(() => {
      document.getElementById(tabDomId(idPrefix, next.href))?.focus();
    });
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:thin]"
    >
      {tabs.map((tab, index) => {
        const isActive = activeHref != null && tab.href === activeHref;
        return (
          <div
            key={tab.href}
            className="group relative flex h-full shrink-0 items-center"
          >
            <button
              type="button"
              id={tabDomId(idPrefix, tab.href)}
              role="tab"
              aria-selected={isActive}
              title={tab.title}
              tabIndex={isActive || (activeHref == null && index === 0) ? 0 : -1}
              className={cn(
                'relative flex h-full max-w-52 items-center text-left text-sm tracking-wide transition-colors',
                'px-2.5 outline-none',
                canClose ? 'pr-7' : 'pr-2.5',
                'rounded-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
                isActive
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onSelect(tab.href)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  focusTabAt((index + 1) % tabs.length);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  focusTabAt((index - 1 + tabs.length) % tabs.length);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  focusTabAt(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  focusTabAt(tabs.length - 1);
                } else if (canClose && (event.key === 'Delete' || event.key === 'Backspace')) {
                  event.preventDefault();
                  onClose(tab.href);
                }
              }}
            >
              <span className="truncate">{tab.title}</span>
              {isActive ? (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute bottom-0 left-2.5 h-0.5 rounded-full bg-foreground',
                    canClose ? 'right-7' : 'right-2.5',
                  )}
                />
              ) : null}
            </button>
            {canClose ? (
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                title={`Close ${tab.title}`}
                tabIndex={-1}
                className={cn(
                  'absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-md',
                  'text-muted-foreground outline-none transition-colors',
                  'hover:bg-muted hover:text-foreground',
                  'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50',
                  isActive
                    ? 'opacity-70 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.href);
                }}
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
      <div className="flex shrink-0 items-center pl-0.5">{newTabMenu}</div>
    </div>
  );
}

function SplitToggleButton({
  split,
  onToggle,
}: {
  split: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={split ? 'secondary' : 'ghost'}
      className="hidden shrink-0 text-muted-foreground md:inline-flex"
      aria-pressed={split}
      title="Split view (⌘\\)"
      onClick={onToggle}
    >
      <Columns2Icon data-icon="inline-start" />
      Split
    </Button>
  );
}

function SplitEmptyPane({
  onOpen,
}: {
  onOpen: (href: string) => void;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted-foreground">Open a page to view it here</p>
      <WorkspaceNewTabMenu
        currentHref={null}
        onSelect={onOpen}
      />
    </div>
  );
}

export function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  const {
    tabs,
    activeHref,
    split,
    splitHref,
    splitRatio,
    openTab,
    closeTab,
    focusTab,
    setSplitHref,
    setSplitRatio,
    toggleSplit,
  } = useWorkspace();
  const dragRef = useRef<{ startX: number; startRatio: number } | null>(null);

  const rightHref = splitHref;
  const canClose = tabs.length > 1;

  const openOnRight = (href: string) => {
    openTab(href, { background: true });
    setSplitHref(href);
  };

  const splitToggle = <SplitToggleButton split={split} onToggle={toggleSplit} />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {split ? (
        <div className="flex h-12 shrink-0 items-stretch bg-card/40 backdrop-blur-[2px]">
          <div
            className="flex min-w-0 items-stretch pl-2 sm:pl-3"
            style={{ width: `${splitRatio}%` }}
          >
            <WorkspaceTabBar
              tabs={tabs}
              activeHref={activeHref}
              canClose={canClose}
              idPrefix="workspace-tab-left"
              ariaLabel="Left pane pages"
              onSelect={focusTab}
              onClose={closeTab}
              newTabMenu={
                <WorkspaceNewTabMenu
                  currentHref={activeHref}
                  onSelect={(href) => openTab(href)}
                />
              }
            />
          </div>
          <div className="w-1.5 shrink-0" />
          <div className="flex min-w-0 flex-1 items-stretch pr-2 sm:pr-3">
            <WorkspaceTabBar
              tabs={tabs}
              activeHref={rightHref}
              canClose={canClose}
              idPrefix="workspace-tab-right"
              ariaLabel="Right pane pages"
              onSelect={(href) => setSplitHref(href)}
              onClose={closeTab}
              newTabMenu={
                <WorkspaceNewTabMenu currentHref={rightHref} onSelect={openOnRight} />
              }
            />
            <div className="ml-2 flex shrink-0 items-center">{splitToggle}</div>
          </div>
        </div>
      ) : (
        <div className="flex h-12 shrink-0 items-stretch bg-card/40 px-2 backdrop-blur-[2px] sm:px-3">
          <WorkspaceTabBar
            tabs={tabs}
            activeHref={activeHref}
            canClose={canClose}
            idPrefix="workspace-tab"
            ariaLabel="Open pages"
            onSelect={focusTab}
            onClose={closeTab}
            newTabMenu={<WorkspaceNewTabMenu />}
          />
          <div className="ml-2 flex shrink-0 items-center">{splitToggle}</div>
        </div>
      )}

      {split ? (
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            className="min-h-0 min-w-0 overflow-auto"
            style={{ width: `${splitRatio}%` }}
          >
            {children}
          </div>
          <button
            type="button"
            aria-label="Resize split"
            className="group relative z-10 w-1.5 shrink-0 cursor-ew-resize bg-border/70 hover:bg-primary/60"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              dragRef.current = { startX: event.clientX, startRatio: splitRatio };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              const parent = event.currentTarget.parentElement;
              if (!parent) return;
              const deltaPct = ((event.clientX - drag.startX) / parent.clientWidth) * 100;
              setSplitRatio(drag.startRatio + deltaPct);
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            {rightHref ? (
              <iframe
                key={rightHref}
                title="Split view"
                src={withEmbedParam(rightHref)}
                className="min-h-0 w-full flex-1 border-0 bg-background"
              />
            ) : (
              <SplitEmptyPane onOpen={openOnRight} />
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
      )}
    </div>
  );
}
