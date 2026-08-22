'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Plus, UserRoundSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  parseGraderPaste,
  mergeGraderLists,
  type GraderInput,
} from '@/lib/grader-parse';
import type { EligibleGraderUser } from '@/lib/import-graders';
import { roleLabel } from '@/lib/roles';
import { teamDotClass } from '@/lib/team-colors';
import { TitleCount } from '@/components/page-shell';
import { evenSplitRange } from '@/lib/assignments';
import { cn } from '@/lib/utils';

interface GraderTeamColumnProps {
  team: string;
  applicationCount: number;
  graders: GraderInput[];
  eligibleUsers?: EligibleGraderUser[];
  minGraders?: number;
  error?: string;
  onChange: (graders: GraderInput[]) => void;
  onError: (message: string) => void;
  className?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function GraderTeamColumnSkeleton() {
  return (
    <div className="flex min-h-0 flex-col gap-3" aria-hidden>
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-11 w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-[4.25rem] w-full rounded-lg" />
        <Skeleton className="h-[4.25rem] w-full rounded-lg" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
      </div>
    </div>
  );
}

export default function GraderTeamColumn({
  team,
  applicationCount,
  graders,
  eligibleUsers = [],
  minGraders = 2,
  error,
  onChange,
  onError,
  className,
}: GraderTeamColumnProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [dropUp, setDropUp] = useState(false);

  const DROPDOWN_MAX_HEIGHT = 192; // max-h-48

  const existingEmails = useMemo(
    () => new Set(graders.map((g) => normalizeEmail(g.email)).filter(Boolean)),
    [graders],
  );

  const availableUsers = useMemo(
    () => eligibleUsers.filter((user) => !existingEmails.has(normalizeEmail(user.email))),
    [eligibleUsers, existingEmails],
  );

  const filteredUsers = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return availableUsers;
    return availableUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        roleLabel(user.role).toLowerCase().includes(query),
    );
  }, [availableUsers, pickerQuery]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;

    const updatePlacement = () => {
      const anchor = pickerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropUp(spaceBelow < DROPDOWN_MAX_HEIGHT + 8 && spaceAbove > spaceBelow);
    };

    updatePlacement();
    requestAnimationFrame(() => {
      pickerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [pickerOpen, pickerQuery, filteredUsers.length]);

  const handlePaste = (text: string) => {
    const { graders: parsed, error } = parseGraderPaste(text, { minGraders: 0 });
    if (error) {
      onError(`${team}: ${error}`);
      return;
    }
    if (parsed.length === 0) {
      onError(`${team}: No users found in pasted text.`);
      return;
    }
    onChange(mergeGraderLists(graders, parsed));
  };

  const updateGrader = (index: number, field: keyof GraderInput, value: string) => {
    onChange(graders.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };

  const removeGrader = (index: number) => {
    onChange(graders.filter((_, i) => i !== index));
  };

  const addGrader = () => {
    onChange([...graders, { name: '', email: '' }]);
  };

  const addUserAsGrader = (user: EligibleGraderUser) => {
    onChange(mergeGraderLists(graders, [{ name: user.name, email: user.email }]));
    setPickerQuery('');
    setPickerOpen(false);
  };

  const openPicker = () => {
    setPickerOpen(true);
    setPickerQuery('');
  };

  const showPickerDropdown = pickerOpen && (pickerQuery.trim().length > 0 || availableUsers.length > 0);
  const split =
    graders.length >= minGraders
      ? evenSplitRange(applicationCount, graders.length, minGraders)
      : null;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-3',
        pickerOpen && !dropUp && 'pb-52',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn('size-2 shrink-0 rounded-full', teamDotClass(team))}
            aria-hidden
          />
          {team}
          <TitleCount>{applicationCount}</TitleCount>
        </Label>
        {graders.length > 0 && (
          <span
            className={cn(
              'text-sm tabular-nums',
              graders.length >= minGraders ? 'text-muted-foreground' : 'text-amber-700',
            )}
          >
            {graders.length} user{graders.length === 1 ? '' : 's'}
            {graders.length < minGraders && ` · need ${minGraders}`}
            {split &&
              ` · ~${split.low === split.high ? split.low : `${split.low}–${split.high}`} each`}
          </span>
        )}
      </div>

      <div
        tabIndex={0}
        onPaste={(e) => {
          e.preventDefault();
          handlePaste(e.clipboardData.getData('text'));
        }}
        className="flex cursor-text items-center justify-center gap-2 rounded-md border border-dashed border-foreground/20 bg-muted/40 px-3 py-3 text-center text-sm text-muted-foreground uma-hover-on-panel focus:outline-none focus:ring-2 focus:ring-ring/30"
      >
        <ClipboardPaste className="size-3.5 shrink-0" aria-hidden />
        Paste spreadsheet here
      </div>

      <div className="flex flex-col gap-2">
        {graders.map((grader, index) => (
          <div
            key={index}
            className="flex gap-2 rounded-lg bg-muted/40 p-2.5"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                value={grader.name}
                onChange={(e) => updateGrader(index, 'name', e.target.value)}
                placeholder="Name"
                className="h-8 rounded-md border border-input bg-background text-sm shadow-none focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/40"
              />
              <Input
                value={grader.email}
                onChange={(e) => updateGrader(index, 'email', e.target.value)}
                placeholder="email@berkeley.edu"
                type="email"
                className="h-8 rounded-md border border-input bg-background text-sm shadow-none focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/40"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 self-center text-muted-foreground hover:text-foreground"
              aria-label="Remove user"
              onClick={() => removeGrader(index)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}

        <div className="mt-1 flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={addGrader}
            >
              <Plus className="size-3.5" />
              Add user
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5"
              onClick={openPicker}
              disabled={availableUsers.length === 0}
            >
              <UserRoundSearch className="size-3.5" />
              Pick User
            </Button>
          </div>

          {pickerOpen && (
            <div ref={pickerRef} className="relative space-y-1.5">
              <Input
                value={pickerQuery}
                placeholder="Search name or email…"
                className="h-8 rounded-md border border-input bg-background text-sm shadow-none focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring/40"
                autoFocus
                onFocus={() => setPickerOpen(true)}
                onChange={(e) => {
                  setPickerQuery(e.target.value);
                  setPickerOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredUsers[0]) {
                    e.preventDefault();
                    addUserAsGrader(filteredUsers[0]);
                  }
                  if (e.key === 'Escape') {
                    setPickerOpen(false);
                    setPickerQuery('');
                  }
                }}
              />
              {showPickerDropdown && (
                <ul
                  className={cn(
                    'absolute z-20 max-h-48 w-full overflow-auto rounded-md border bg-popover py-1',
                    dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
                  )}
                >
                  {filteredUsers.length === 0 ? (
                    <li className="px-2 py-1.5 text-sm text-muted-foreground">
                      {availableUsers.length === 0
                        ? 'All eligible users are already listed.'
                        : 'No matching users.'}
                    </li>
                  ) : (
                    filteredUsers.map((user) => (
                      <li key={user.email}>
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left normal-case uma-hover-on-panel transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addUserAsGrader(user);
                          }}
                        >
                          <span className="text-sm font-medium">{user.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {user.email} · {roleLabel(user.role)}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
