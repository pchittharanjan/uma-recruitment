'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PersonOption {
  id: number;
  label: string;
  searchText: string;
}

interface SchedulePersonInputProps {
  value: number | null;
  options: PersonOption[];
  placeholder?: string;
  showOnFocus?: boolean;
  onChange: (id: number | null) => void;
  className?: string;
}

export function SchedulePersonInput({
  value,
  options,
  placeholder = 'Type to search…',
  showOnFocus = false,
  onChange,
  className,
}: SchedulePersonInputProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [selected?.label, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? options.filter((o) => o.searchText.includes(q) || o.label.toLowerCase().includes(q))
      : options;
    return pool;
  }, [options, query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (option: PersonOption) => {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  };

  const showDropdown = open && filtered.length > 0 && (showOnFocus || query.trim().length > 0);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Input
        value={query}
        placeholder={placeholder}
        className="h-8 border-border bg-popover text-sm text-foreground placeholder:text-muted-foreground"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!next.trim()) {
            onChange(null);
            return;
          }
          const exact = options.find((o) => o.label.toLowerCase() === next.trim().toLowerCase());
          if (exact) onChange(exact.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtered[0]) {
            e.preventDefault();
            pick(filtered[0]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {showDropdown && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground">
          {filtered.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
