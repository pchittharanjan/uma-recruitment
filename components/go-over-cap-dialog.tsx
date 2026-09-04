'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';

type OverCapStage = AdvancementFromStage | 'deliberations';

interface GoOverCapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number;
  stage: OverCapStage;
  officialCap: number | null;
  currentExtra: number;
  onSuccess: (overCapExtra: number) => void;
}

export function GoOverCapDialog({
  open,
  onOpenChange,
  teamId,
  stage,
  officialCap,
  currentExtra,
  onSuccess,
}: GoOverCapDialogProps) {
  const [code, setCode] = useState('');
  const [extraInput, setExtraInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCode('');
      setExtraInput('');
      setSubmitting(false);
      return;
    }
    setCode('');
    setExtraInput(currentExtra > 0 ? String(currentExtra) : '');
    setSubmitting(false);
  }, [open, currentExtra]);

  const handleSubmit = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      toast.error('Enter the go-over code.');
      return;
    }
    const extraCount = Number.parseInt(extraInput.trim(), 10);
    if (!Number.isInteger(extraCount) || extraCount < 1) {
      toast.error('Extra count must be a positive whole number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/team/advancement/over-cap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, stage, code: trimmedCode, extraCount }),
      });
      const json = (await res.json()) as { error?: string; overCapExtra?: number };
      if (!res.ok) {
        toast.error(json.error ?? 'Could not raise the limit.');
        return;
      }
      const nextExtra = json.overCapExtra ?? extraCount;
      toast.success(
        officialCap != null
          ? `You may now select up to ${officialCap + nextExtra} (limit ${officialCap} + ${nextExtra} extra).`
          : `Extra slots granted: +${nextExtra}.`,
      );
      onSuccess(nextExtra);
      onOpenChange(false);
    } catch {
      toast.error('Network error: could not raise the limit.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader className="gap-2 text-left">
            <DialogTitle className="text-base">Go over this limit</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {officialCap != null
                ? `Enter the go-over code and how many extra people beyond the official limit of ${officialCap}.`
                : 'Enter the go-over code and how many extra people beyond the official limit.'}
              {currentExtra > 0
                ? ` You currently have +${currentExtra} extra.`
                : ''}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 border-t border-border px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor={`go-over-code-${teamId}-${stage}`}>Go-over code</Label>
            <PasswordInput
              id={`go-over-code-${teamId}-${stage}`}
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={submitting}
              className="h-10 bg-background"
              wrapperClassName="max-w-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`go-over-extra-${teamId}-${stage}`}>
              How many extra beyond the official limit
            </Label>
            <Input
              id={`go-over-extra-${teamId}-${stage}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={extraInput}
              onChange={(e) => setExtraInput(e.target.value)}
              disabled={submitting}
              className="h-10 bg-background"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  void handleSubmit();
                }
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>
            Cancel
          </DialogClose>
          <LoadingButton loading={submitting} onClick={handleSubmit}>
            Raise limit
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
