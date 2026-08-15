'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { dispatchPipelinePhaseChanged } from '@/lib/pipeline-events';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';

const ERASE_DESCRIPTION = (
  <>
    This removes all rounds (including a closed cycle), all imported applications and
    assignments, coffee chat submissions, and simulated{' '}
    <code className="text-xs">.test@berkeley.edu</code> grader accounts.
    <br />
    <br />
    This cannot be undone. After erasing, you can import again from the Import flow.
  </>
);

export function EraseTestDataButton({
  onSuccess,
  redirectTo = '/admin/import',
}: {
  onSuccess?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleErase = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/import/reset-test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const message = (data.error as string) ?? 'Failed to erase test data.';
        setError(message);
        toast.error(message);
        return;
      }
      toast.success('Test data erased');
      onSuccess?.();
      dispatchPipelinePhaseChanged();
      const destination = redirectTo.split('?')[0];
      router.replace(destination);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <DestructiveConfirmDialog
        title="Erase all test data?"
        description={ERASE_DESCRIPTION}
        confirmLabel="Erase test data"
        onConfirm={handleErase}
        trigger={<LoadingButton variant="danger" disabled={loading} />}
        triggerLabel="Erase test data"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
