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
import { isTeamName, teamStepCircleClass } from '@/lib/team-colors';
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

function teamIconTone(teamName: string | null) {
  if (!teamName || !isTeamName(teamName)) return null;
  if (teamName === 'Strategy') {
    return {
      iconClass: 'text-orange-700',
      ringClass: 'bg-orange-100 ring-orange-200/80',
    };
  }
  if (teamName === 'Events') {
    return {
      iconClass: 'text-blue-700',
      ringClass: 'bg-blue-100 ring-blue-200/80',
    };
  }
  return {
    iconClass: 'text-violet-700',
    ringClass: 'bg-violet-100 ring-violet-200/80',
  };
}

function PhaseTourSteps({
  teamName,
  steps,
}: {
  teamName: string | null;
  steps: { title: string; description: string }[];
}) {
  return (
    <ol className="grid gap-2.5">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="rounded-lg border border-border bg-muted/40 p-3 sm:p-3.5"
        >
          <div className="flex items-center gap-4.5">
            <span aria-hidden className={teamStepCircleClass(teamName, index, steps.length)}>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium leading-snug text-foreground">{step.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Welcome dialog when a pipeline phase opens — greeting, steps, single CTA.
 * No confetti — that stays reserved for final selection.
 */
export function PhaseOpenedDialog({
  open,
  status,
  cycleLabel,
  href,
  userName,
  teamName = null,
  isDirector = false,
  onOpenChange,
}: {
  open: boolean;
  status: RoundStatus;
  cycleLabel: string;
  href: string;
  userName: string;
  teamName?: string | null;
  isDirector?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const tour = getPhaseTourContent(status, { isDirector });
  const Icon = tour?.icon;
  const headline = phaseWelcomeHeadline(userName, status, teamName);
  const tone = teamIconTone(teamName);

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
        className="gap-0 overflow-hidden p-0 sm:max-w-[720px]"
      >
        <div aria-hidden className="uma-marketing-gradient h-3 w-full opacity-90" style={{ marginBottom: '-6px' }} />

        <div className="space-y-2 px-8 pt-11 pb-4">
          <DialogHeader className="gap-4 text-left">
            <div className="flex items-center gap-3.5">
              {Icon && tour ? (
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                    tone?.ringClass ?? tour.ringClass,
                  )}
                >
                  <Icon className={cn('h-5 w-5', tone?.iconClass ?? tour.iconClass)} />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-left text-lg leading-snug sm:text-xl sm:whitespace-nowrap" style={{ WebkitTextStroke: '0.1px currentColor' }}>
                  {headline}
                </DialogTitle>
              </div>
            </div>

            {tour ? (
              <DialogDescription className="text-pretty w-full max-w-none text-left text-sm leading-relaxed">
                {tour.message}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {tour && tour.steps.length > 0 ? (
            <PhaseTourSteps teamName={teamName} steps={tour.steps} />
          ) : null}
        </div>

        <div className="px-8 pt-3 pb-6">
          <Button type="button" className="h-11 w-full text-base" onClick={goToPhase}>
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
