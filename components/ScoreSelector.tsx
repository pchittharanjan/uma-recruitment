'use client';

import { cn } from '@/lib/utils';

interface Props {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
  /** Inclusive max score. Defaults to 5 (application grading). */
  max?: number;
}

export default function ScoreSelector({ value, onChange, disabled, max = 5 }: Props) {
  const scaleMax = max >= 2 ? max : 5;
  const options = Array.from({ length: scaleMax }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Score 1 to ${scaleMax}`}>
      {options.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            'size-11 rounded-lg border-2 text-sm font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === n
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-foreground/35 bg-[var(--surface-raised)] text-foreground shadow-sm hover:border-primary hover:text-primary',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
