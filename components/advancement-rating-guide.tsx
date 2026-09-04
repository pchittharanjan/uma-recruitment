'use client';

import { ADVANCEMENT_RATING_LEGEND } from '@/lib/advancement-verdict-types';
import { cn } from '@/lib/utils';

const DOT_CLASS: Record<(typeof ADVANCEMENT_RATING_LEGEND)[number]['verdict'], string> = {
  green: 'bg-green-500',
  high_yellow: 'bg-yellow-400',
  yellow: 'bg-amber-400',
  low_yellow: 'bg-orange-400',
  red: 'bg-red-500',
};

export function AdvancementRatingGuide({
  intro,
  steps,
  className,
}: {
  intro: string;
  /** Numbered next steps shown inline below the intro (merged from advancementStepGuide). */
  steps?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3.5',
        className,
      )}
      data-tour="advancement-rating-guide"
    >
      <p className="text-sm font-medium text-foreground">Required: rate who should advance</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>
      {steps ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{steps}</p>
      ) : null}
      <dl className="grid gap-2 sm:grid-cols-2">
        {ADVANCEMENT_RATING_LEGEND.map(({ verdict, label, meaning }) => (
          <div key={verdict} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', DOT_CLASS[verdict])}
            />
            <div>
              <dt className="font-medium text-foreground">{label}</dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
