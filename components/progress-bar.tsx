import { Progress } from '@/components/ui/progress';

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
    <div className="w-full space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex items-center gap-3">
        <Progress
          value={pct}
          max={100}
          className="min-w-0 flex-1 gap-0 [&_[data-slot=progress-track]]:h-2"
        />
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {value}/{max} ({pct}%)
        </span>
      </div>
    </div>
  );
}
