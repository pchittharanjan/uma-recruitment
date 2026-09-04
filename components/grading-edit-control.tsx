'use client';

import Link from 'next/link';
import { CircleHelpIcon, PencilIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { gradingAppHref, type GradingAudience } from '@/lib/grading-paths';

export function GradingEditControl({
  teamId,
  applicationId,
  locked,
  lockMessage,
  label = 'Edit scores',
  audience = 'team',
}: {
  teamId: string;
  applicationId: number;
  locked: boolean;
  lockMessage: string;
  label?: string;
  audience?: GradingAudience;
}) {
  const href = gradingAppHref(teamId, applicationId, audience);

  if (!locked) {
    return (
      <Link
        href={href}
        prefetch
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground uma-hover-on-panel hover:text-foreground"
        aria-label={label}
      >
        <PencilIcon className="size-4" />
      </Link>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className="inline-flex h-8 shrink-0 cursor-not-allowed items-center gap-1 rounded-md px-1.5 text-muted-foreground/40"
              aria-label={lockMessage}
            >
              <PencilIcon className="size-4" />
              <CircleHelpIcon className="size-3.5" />
            </span>
          }
        />
        <TooltipContent>{lockMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
