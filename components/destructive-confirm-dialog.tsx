'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';

interface DestructiveConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  trigger?: ReactElement;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DestructiveConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  trigger,
  triggerLabel,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: DestructiveConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;

  const handleConfirm = async () => {
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
      {trigger ? (
        <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      ) : null}
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        closeButtonClassName="top-4 right-4"
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangleIcon className="h-5 w-5 text-destructive" />
          </div>
          <DialogHeader className="gap-2.5 pr-10 text-left">
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-border/60 bg-muted/40 px-6 py-4">
          <DialogClose render={<Button variant="outline" disabled={confirming} />}>
            Cancel
          </DialogClose>
          <LoadingButton variant="danger" loading={confirming} onClick={handleConfirm}>
            {confirmLabel}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
