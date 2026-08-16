'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import { dispatchPipelinePhaseChanged } from '@/lib/pipeline-events';
import { phaseLabel } from '@/lib/stages';

/**
 * Advances every active round to the next pipeline phase.
 * Used wherever a CTA says "Move All teams…" so the click POSTs instead of only navigating.
 */
export function AdvancePipelineButton({
  label = 'Move All teams to Application →',
  className,
  size = 'default',
  /** Where to go after a successful advance. Omit to stay and refresh. */
  redirectTo,
}: {
  label?: string;
  className?: string;
  size?: 'default' | 'sm';
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'advance' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          typeof json.error === 'string' ? json.error : 'Could not advance all teams.';
        toast.error(message);
        setBusy(false);
        return;
      }

      const statusLabel =
        typeof json.status === 'string' ? phaseLabel(json.status) : 'next phase';
      const warningText = Array.isArray(json.warnings)
        ? json.warnings
            .filter((w: unknown): w is string => typeof w === 'string' && Boolean(w.trim()))
            .join(' ')
        : '';
      toast.success(`Advanced all teams to ${statusLabel}`, {
        description: warningText || undefined,
      });

      dispatchPipelinePhaseChanged();

      // Soft refresh/push is not enough when we are already on the gated page
      // (e.g. /admin/import) — the server layout must remount with the new phase.
      if (redirectTo) {
        window.location.assign(redirectTo);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      toast.error('Network error. Try again.');
      setBusy(false);
    }
  };

  return (
    <LoadingButton
      variant="primary"
      size={size}
      className={className ?? 'uma-cta-primary'}
      disabled={busy}
      loading={busy}
      onClick={onClick}
    >
      {label}
    </LoadingButton>
  );
}
