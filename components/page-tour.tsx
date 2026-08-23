'use client';

import { usePathname } from 'next/navigation';
import { CircleHelpIcon } from 'lucide-react';
import { driver, type DriveStep } from 'driver.js';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { hasPageTour, matchPageTour } from '@/lib/page-tours';
import { cn } from '@/lib/utils';

import 'driver.js/dist/driver.css';
import './page-tour.css';

const POPOVER_CLASS = 'uma-page-tour-popover';

let activeDriver: ReturnType<typeof driver> | null = null;

function destroyActiveTour() {
  if (activeDriver) {
    activeDriver.destroy();
    activeDriver = null;
  }
}

function renderProgressDots(
  footer: HTMLElement,
  activeIndex: number,
  total: number,
) {
  footer.querySelector('.uma-page-tour-dots')?.remove();
  if (total <= 1) return;

  const dots = document.createElement('div');
  dots.className = 'uma-page-tour-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement('span');
    if (i === activeIndex) dot.setAttribute('data-active', 'true');
    dots.appendChild(dot);
  }
  footer.insertBefore(dots, footer.firstChild);
}

/**
 * Start the registered tour for `pathname`. Missing `[data-tour]` targets are
 * skipped so partial pages (empty queues, locked phases) don't crash.
 */
export function startPageTour(pathname: string): boolean {
  const tour = matchPageTour(pathname);
  if (!tour) return false;

  const steps: DriveStep[] = [];
  for (const step of tour.steps) {
    const selector = `[data-tour="${step.id}"]`;
    if (!document.querySelector(selector)) continue;
    steps.push({
      element: selector,
      popover: {
        title: step.title,
        description: step.description,
        side: 'bottom',
        align: 'start',
      },
    });
  }

  if (steps.length === 0) return false;

  destroyActiveTour();

  const instance = driver({
    steps,
    animate: true,
    allowClose: true,
    overlayColor: 'rgb(0, 0, 0)',
    overlayOpacity: 0.1,
    stagePadding: 6,
    stageRadius: 12,
    smoothScroll: true,
    popoverClass: POPOVER_CLASS,
    showProgress: true,
    progressText: '',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    onPopoverRender: (popover, { config, state }) => {
      const total = config.steps?.length ?? 0;
      const index = state.activeIndex ?? 0;
      renderProgressDots(popover.footer, index, total);
    },
    onDestroyed: () => {
      if (activeDriver === instance) activeDriver = null;
    },
  });

  activeDriver = instance;
  instance.drive();
  return true;
}

export function PageTourHelpButton({
  className,
  pathname: pathnameProp,
}: {
  className?: string;
  /** Override when chrome pathname differs from the route (rare). */
  pathname?: string;
}) {
  const routePathname = usePathname();
  const pathname = pathnameProp ?? routePathname ?? '';
  const available = hasPageTour(pathname);

  if (!available) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn('shrink-0 text-muted-foreground', className)}
            aria-label="Tour this page"
            onClick={() => startPageTour(pathname)}
          />
        }
      >
        <CircleHelpIcon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">Tour this page</TooltipContent>
    </Tooltip>
  );
}
