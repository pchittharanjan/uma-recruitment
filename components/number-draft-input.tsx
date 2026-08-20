'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function NumberDraftInput({
  value,
  onCommit,
  min,
  max,
  integer = false,
  commitOnChange = false,
  invalid = false,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  commitOnChange?: boolean;
  invalid?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const parseDraft = (raw: string): number | null => {
    const parsed = integer ? Number.parseInt(raw.trim(), 10) : Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : null;
  };

  const clamp = (n: number): number => {
    let next = n;
    if (min != null && next < min) next = min;
    if (max != null && next > max) next = max;
    return next;
  };

  const emptyFallback = min != null && min > 0 ? min : 0;

  const commit = (raw: string, { clampToRange }: { clampToRange: boolean }) => {
    if (raw.trim() === '') {
      onCommit(emptyFallback);
      if (clampToRange) setDraft(String(emptyFallback));
      return;
    }
    const parsed = parseDraft(raw);
    if (parsed == null) {
      setDraft(String(value));
      return;
    }
    if (!clampToRange && max != null && parsed > max) return;
    const next = clampToRange ? clamp(parsed) : parsed;
    onCommit(next);
    if (clampToRange) setDraft(String(next));
  };

  const allowed = integer ? /^\d*$/ : /^\d*\.?\d*$/;

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={cn('bg-background', className)}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== '' && !allowed.test(raw)) return;
        if (max != null) {
          const parsed = parseDraft(raw);
          if (parsed != null && parsed > max) return;
        }
        setDraft(raw);
        if (commitOnChange) commit(raw, { clampToRange: false });
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(draft, { clampToRange: true });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
