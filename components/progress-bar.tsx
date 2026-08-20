import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export default function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);

  return (
    <div className="flex w-full items-center gap-3 pb-2">
      {label && <p className="shrink-0 uma-section-label">{label}</p>}
      <Progress
        value={pct}
        max={100}
        className={cn(
          'min-w-0 flex-1 gap-0 [&_[data-slot=progress-track]]:h-2',
          label ? '' : 'self-center',
        )}
      />
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
        {value}/{max} ({pct}%)
      </span>
    </div>
  );
}
