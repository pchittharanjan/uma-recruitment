'use client';

import { InfoIcon } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AvgScoreVariant = 'application' | 'interview';

export const AVG_SCORE_TOOLTIP_APPLICATION =
  'Team avg is visible to everyone on this team. Primary number is the leniency-adjusted average used for ranking: each rubric score (1–5) is nudged so tough and easy graders are comparable, then averaged. Hover for “Raw” — the same scores averaged with no adjustment.';

export const AVG_SCORE_TOOLTIP_INTERVIEW =
  'Team avg is visible to everyone on this team. Mean of this applicant’s completed interview assignment totals. No leniency adjustment.';

export const AVG_SCORE_TOOLTIP = AVG_SCORE_TOOLTIP_APPLICATION;

const TOOLTIPS: Record<AvgScoreVariant, string> = {
  application: AVG_SCORE_TOOLTIP_APPLICATION,
  interview: AVG_SCORE_TOOLTIP_INTERVIEW,
};

export function AvgScoreHeader({
  className,
  align = 'left',
  variant = 'application',
}: {
  className?: string;
  align?: 'left' | 'right';
  variant?: AvgScoreVariant;
}) {
  return (
    <TableHead
      className={cn(
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1',
          align === 'right' && 'w-full justify-end',
        )}
      >
        Team avg
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="inline-flex text-muted-foreground hover:text-foreground"
            aria-label="What team avg means"
          >
            <InfoIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="top">
            {TOOLTIPS[variant]}
          </TooltipContent>
        </Tooltip>
      </span>
    </TableHead>
  );
}

/** Team avg primary; optional personal mean as a muted secondary line. Raw (if provided) on hover. */
export function AvgScoreCell({
  average,
  rawAverage,
  myAverage,
  align = 'left',
  className,
}: {
  average: number;
  rawAverage?: number | null;
  myAverage?: number | null;
  align?: 'left' | 'right';
  className?: string;
}) {
  const showRaw =
    rawAverage !== undefined &&
    rawAverage !== null &&
    Number.isFinite(rawAverage);
  const showMine =
    myAverage !== undefined &&
    myAverage !== null &&
    Number.isFinite(myAverage);

  const content = (
    <span
      className={cn(
        'inline-flex flex-col gap-0.5 text-sm tabular-nums',
        align === 'right' && 'items-end text-right',
        className,
      )}
    >
      <span>{average.toFixed(2)}</span>
      {showMine ? (
        <span className="text-xs text-muted-foreground">
          Yours {myAverage.toFixed(2)}
        </span>
      ) : null}
    </span>
  );

  if (!showRaw) return content;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          'cursor-default',
          align === 'right' && 'ml-auto block',
        )}
      >
        {content}
      </TooltipTrigger>
      <TooltipContent side="top">
        Raw average {rawAverage.toFixed(2)} (before leniency adjustment)
      </TooltipContent>
    </Tooltip>
  );
}
