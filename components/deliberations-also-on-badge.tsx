'use client';

import { Badge } from '@/components/ui/badge';
import {
  deliberationsAlsoOnLabel,
  type DeliberationsOtherTeamPlacement,
} from '@/lib/deliberations-types';
import { cn } from '@/lib/utils';

export function DeliberationsAlsoOnBadges({
  placements,
  className,
  badgeClassName,
}: {
  placements: DeliberationsOtherTeamPlacement[] | null | undefined;
  className?: string;
  badgeClassName?: string;
}) {
  if (!placements?.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {placements.map((placement) => (
        <Badge
          key={`${placement.teamName}:${placement.stage}`}
          variant="outline"
          className={cn(
            'max-w-full truncate border-foreground/20 bg-white/80 px-1.5 py-0 text-[0.65rem] font-medium text-foreground/80',
            badgeClassName,
          )}
          title={deliberationsAlsoOnLabel(placement)}
        >
          {deliberationsAlsoOnLabel(placement)}
        </Badge>
      ))}
    </div>
  );
}
