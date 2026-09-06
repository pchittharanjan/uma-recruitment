'use client';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type InterviewScoringPhase = 'case' | 'behavioral';

const PHASE_OPTIONS: { value: InterviewScoringPhase; label: string }[] = [
  { value: 'case', label: 'Case' },
  { value: 'behavioral', label: 'Behavioral' },
];

export function InterviewPhaseToggle({
  value,
  onValueChange,
  className,
}: {
  value: InterviewScoringPhase;
  onValueChange: (next: InterviewScoringPhase) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        const selected = next[0];
        if (selected === 'case' || selected === 'behavioral') onValueChange(selected);
      }}
      aria-label="Interview part"
      data-tour="interview-phase"
      className={cn('shrink-0', className)}
    >
      {PHASE_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(
            'cursor-pointer normal-case text-muted-foreground',
            'hover:bg-muted/70 hover:text-foreground',
            'aria-pressed:bg-primary aria-pressed:text-primary-foreground',
            'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
            'data-[state=on]:hover:bg-primary-hover data-[state=on]:hover:text-primary-foreground',
            'data-[state=on]:border-primary',
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
