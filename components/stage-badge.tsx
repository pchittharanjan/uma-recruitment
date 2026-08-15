import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StageColor = 'blue' | 'green' | 'gray' | 'yellow' | 'orange';

const colorClasses: Record<StageColor, string> = {
  blue: 'bg-primary/12 text-[#9a5a2e] ring-1 ring-primary/15',
  green: 'bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/15',
  gray: 'bg-muted text-muted-foreground ring-1 ring-border/50',
  yellow: 'bg-accent/10 text-[#b86a28] ring-1 ring-accent/15',
  orange: 'bg-accent/12 text-[#9c3d2e] ring-1 ring-accent/20',
};

export default function StageBadge({
  label,
  color = 'gray',
}: {
  label: string;
  color?: StageColor;
}) {
  return (
    <Badge className={cn('border-0 font-medium', colorClasses[color])}>
      {label}
    </Badge>
  );
}
