'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import LoadingButton from '@/components/loading-button';
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

interface TypedConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  confirmationPhrase: string;
  inputId?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
}

export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmationPhrase,
  inputId = 'typed-confirm-phrase',
  confirmVariant = 'primary',
  onConfirm,
}: TypedConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const phraseMatches = typed === confirmationPhrase;

  useEffect(() => {
    if (!open) {
      setTyped('');
      setConfirming(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!phraseMatches) return;
    setConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Keep dialog open so the user can retry after an error toast.
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        closeButtonClassName="top-4 right-4"
      >
        <div className="flex items-center gap-4 px-6 pt-6 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
            <AlertTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-500" />
          </div>
          <DialogHeader className="gap-2.5 pr-10 text-left">
            <DialogTitle className="text-base leading-snug">{title}</DialogTitle>
            {description ? (
              <DialogDescription className="leading-relaxed">{description}</DialogDescription>
            ) : null}
          </DialogHeader>
        </div>
        <div className="space-y-2 border-t border-border px-6 py-5">
          <p className="text-sm">
            Type{' '}
            <span className="font-mono font-medium text-destructive">{confirmationPhrase}</span>{' '}
            to confirm
          </p>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            disabled={confirming}
            className="h-10 bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && phraseMatches && !confirming) {
                void handleConfirm();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <DialogClose render={<Button variant="outline" disabled={confirming} />}>
            Cancel
          </DialogClose>
          <LoadingButton
            variant={confirmVariant}
            loading={confirming}
            disabled={!phraseMatches}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
