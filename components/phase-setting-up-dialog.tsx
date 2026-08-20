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
import { getPhaseTourContent, phaseWelcomeHeadline } from '@/lib/phase-tours';
import { isTeamName, teamStepCircleClass } from '@/lib/team-colors';
import { cn } from '@/lib/utils';

const DISMISS_KEY_PREFIX = 'uma-phase-setting-up-v1:';

function dismissKey(cycleLabel: string, status: RoundStatus, teamId: number) {
  return `${DISMISS_KEY_PREFIX}${cycleLabel}:${status}:${teamId}`;
}

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

/**
 * Shown when admin advanced a team into a phase but has not unlocked it yet.
 */
export function PhaseSettingUpDialog({
  open,
  status,
  cycleLabel,
  teamId,
  teamName,
  phaseLabel,
  browseHref,
  userName,
  onOpenChange,
}: {
  open: boolean;
  status: RoundStatus;
  cycleLabel: string;
  teamId: number;
  teamName: string;
  phaseLabel: string;
  browseHref: string;
  userName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const tour = getPhaseTourContent(status);
  const Icon = tour?.icon;
  const headline = phaseWelcomeHeadline(userName, status, teamName);
  const tone = teamIconTone(teamName);

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(cycleLabel, status, teamId), '1');
    } catch {
      // ignore
    }
    onOpenChange(false);
  };

  const goBrowse = () => {
    dismiss();
    if (!isOnDestination(pathname, browseHref)) {
      router.push(browseHref);
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
        className="gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <div
          aria-hidden
          className="uma-marketing-gradient h-3 w-full opacity-90"
          style={{ marginBottom: '-6px' }}
        />

        <div className="space-y-2 px-8 pt-11 pb-6">
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
                <DialogTitle className="text-left text-lg leading-snug sm:text-xl">
                  {headline}
                </DialogTitle>
              </div>
            </div>

            <DialogDescription className="text-pretty w-full max-w-none space-y-3 text-left text-sm leading-relaxed">
              <p>
                We&apos;re still setting up{' '}
                <span className="font-medium text-foreground">{phaseLabel}</span>. Please check
                back later — we&apos;ll notify you here when it&apos;s ready to open.
              </p>
              <p>
                In the meantime, you can review anything that&apos;s already open from earlier
                phases.
              </p>
            </DialogDescription>
          </DialogHeader>

          <Button type="button" className="h-11 w-full text-base" onClick={goBrowse}>
            View open phases
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function wasPhaseSettingUpDismissed(
  cycleLabel: string,
  status: RoundStatus,
  teamId: number,
): boolean {
  try {
    return sessionStorage.getItem(dismissKey(cycleLabel, status, teamId)) === '1';
  } catch {
    return false;
  }
}
