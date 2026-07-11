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
  'Primary number is the leniency-adjusted average used for ranking: each rubric score (1–5) is nudged so tough and easy graders are comparable, then averaged. “Raw” is the same scores averaged with no adjustment.';

export const AVG_SCORE_TOOLTIP_INTERVIEW =
  'Mean of this applicant’s completed interview assignment totals. No leniency adjustment.';

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
        Avg score
        <Tooltip>
          <TooltipTrigger
            type="button"
            className="inline-flex text-muted-foreground hover:text-foreground"
            aria-label="What avg score means"
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

/** Adjusted average; raw (if provided) is available on hover only. */
export function AvgScoreCell({
  average,
  rawAverage,
  align = 'left',
  className,
}: {
  average: number;
  rawAverage?: number | null;
  align?: 'left' | 'right';
  className?: string;
}) {
  const showRaw =
    rawAverage !== undefined &&
    rawAverage !== null &&
    Number.isFinite(rawAverage);

  const content = (
    <span
      className={cn(
        'text-sm tabular-nums',
        align === 'right' && 'text-right',
        className,
      )}
    >
      {average.toFixed(2)}
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
