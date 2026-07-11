'use client';

import { useCallback, useEffect, useState } from 'react';
import { PipelineStatusSnapshot } from '@/components/pipeline-status-snapshot';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import type { UnlockableStage } from '@/lib/stages';

interface GlobalPhaseSnapshot {
  status: RoundStatus | null;
  unlockedStages: UnlockableStage[];
}

export function TeamStageControls() {
  const [state, setState] = useState<GlobalPhaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/phase');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load phase.');
        return;
      }
      setState({
        status: json.status,
        unlockedStages: json.unlockedStages ?? [],
      });
      setError('');
    } catch {
      setError('Failed to load phase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading global status…</p>;
  }

  if (!state?.status) {
    return (
      <p className="text-sm text-muted-foreground">
        {error || 'Global status is not available yet.'}
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <PipelineStatusSnapshot
      status={state.status}
      unlockedStages={state.unlockedStages}
    />
  );
}
