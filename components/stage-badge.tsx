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
