'use client';

import { useCallback, useEffect, useState } from 'react';
import { PipelineStatusSnapshot } from '@/components/pipeline-status-snapshot';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';

interface TeamPhaseSnapshot {
  teamName: string;
  status: RoundStatus | null;
}

export function TeamStageControls({ teamId }: { teamId: number }) {
  const [state, setState] = useState<TeamPhaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/phase`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load phase.');
        return;
      }
      setState({
        teamName: json.team?.name ?? 'Team',
        status: json.round?.status ?? null,
      });
      setError('');
    } catch {
      setError('Failed to load phase.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [load]);

  if (loading) {
    return (
      <Card role="status" aria-label="Loading">
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>Pipeline status</CardTitle>
            <Skeleton className="h-7 w-44 rounded-lg" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!state?.status) {
    return (
      <p className="text-sm text-muted-foreground">
        No active recruiting cycle for this team yet. Advance from the dashboard when ready.
      </p>
    );
  }

  return <PipelineStatusSnapshot teamName={state.teamName} status={state.status} />;
}
