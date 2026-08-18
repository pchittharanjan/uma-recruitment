import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StageColor = 'blue' | 'green' | 'gray' | 'yellow' | 'orange';

const colorClasses: Record<StageColor, string> = {
  blue: 'bg-primary/12 text-[#9a5a2e]',
  green: 'bg-emerald-500/10 text-emerald-800',
  gray: 'bg-muted text-muted-foreground',
  yellow: 'bg-accent/10 text-[#b86a28]',
  orange: 'bg-accent/12 text-[#9c3d2e]',
};

/** Matches phase stepper / stage-access pill scale on the admin dashboard. */
const prominentColorClasses: Record<StageColor, string> = {
  blue: 'border-primary/30 bg-primary/[0.07] text-primary',
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800',
  gray: 'border-border/70 bg-muted/40 text-muted-foreground',
  yellow: 'border-accent/30 bg-accent/10 text-[#b86a28]',
  orange: 'border-accent/30 bg-accent/12 text-[#9c3d2e]',
};

export default function StageBadge({
  label,
  color = 'gray',
  size = 'default',
}: {
  label: string;
  color?: StageColor;
  size?: 'default' | 'prominent' | 'compact';
}) {
  if (size === 'prominent' || size === 'compact') {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-lg border font-medium',
          size === 'compact' ? 'px-2.5 py-1 text-sm' : 'px-3 py-1.5 text-sm',
          prominentColorClasses[color],
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <Badge className={cn('border-0 font-medium', colorClasses[color])}>
      {label}
    </Badge>
  );
}
