'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RoundStatus } from '@/lib/db';
import {
  getPhaseTourContent,
  phaseOpenedCtaLabel,
  phaseWelcomeHeadline,
} from '@/lib/phase-tours';
import { cn } from '@/lib/utils';

const DISMISS_KEY_PREFIX = 'uma-phase-opened-v2:';

function dismissKey(cycleLabel: string, status: RoundStatus) {
  return `${DISMISS_KEY_PREFIX}${cycleLabel}:${status}`;
}

/** Phases that warrant a “new phase open” invite (not setup / closed). */
export const ANNOUNCEABLE_PHASES: RoundStatus[] = [
  'pre_application',
  'application',
  'first_round',
  'final_round',
  'deliberations',
];

export function isAnnounceablePhase(status: RoundStatus): boolean {
  return ANNOUNCEABLE_PHASES.includes(status);
}

export { phaseOpenedCtaLabel };

function isOnDestination(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return href !== '/' && pathname.startsWith(`${href}/`);
}

/**
 * Welcome dialog when a pipeline phase opens — greeting, one-line context, single CTA.
 * No confetti — that stays reserved for final selection.
 */
export function PhaseOpenedDialog({
  open,
  status,
  cycleLabel,
  href,
  userName,
  onOpenChange,
}: {
  open: boolean;
  status: RoundStatus;
  cycleLabel: string;
  href: string;
  userName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const tour = getPhaseTourContent(status);
  const Icon = tour?.icon;
  const headline = phaseWelcomeHeadline(userName, status);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(cycleLabel, status), '1');
    } catch {
      // ignore
    }
    onOpenChange(false);
  };

  const goToPhase = () => {
    dismiss();
    if (!isOnDestination(pathname, href)) {
      router.push(href);
    }
  };

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40"
        className="gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-xl"
      >
        <div aria-hidden className="uma-marketing-gradient h-1.5 w-full opacity-90" />

        <div className="space-y-4 px-8 pt-8 pb-2">
          <DialogHeader className="gap-4 text-left">
            <div className="flex items-start gap-3.5">
              {Icon && tour ? (
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                    tour.ringClass,
                  )}
                >
                  <Icon className={cn('h-5 w-5', tour.iconClass)} />
                </div>
              ) : null}
              <div className="min-w-0 pt-0.5">
                <DialogTitle className="text-balance text-left text-xl leading-snug">
                  {headline}
                </DialogTitle>
              </div>
            </div>

            {tour ? (
              <DialogDescription className="text-pretty text-left text-sm leading-relaxed">
                {tour.message}
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        <div className="flex justify-center px-8 pt-6 pb-8">
          <Button type="button" className="h-11 px-8 text-base" onClick={goToPhase}>
            {phaseOpenedCtaLabel(status)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function wasPhaseOpenedDismissed(cycleLabel: string, status: RoundStatus): boolean {
  try {
    return sessionStorage.getItem(dismissKey(cycleLabel, status)) === '1';
  } catch {
    return false;
  }
}
