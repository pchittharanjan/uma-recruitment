'use client';

import { cn } from '@/lib/utils';

interface Props {
  value: number | null;
  onChange: (score: number) => void;
  disabled?: boolean;
}

export default function ScoreSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Score 1 to 5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            'size-11 rounded-lg border-2 text-sm font-semibold transition-all',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === n
              ? 'scale-105 border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-background text-foreground hover:border-primary/50 hover:text-primary',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
