'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DeliberationsBoardInstructions } from '@/components/deliberations-board-instructions';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import {
  applyDeliberationsLayout,
  type DeliberationsBoardData,
  type DeliberationsBoardLayout,
  type DeliberationsCandidate,
  type DeliberationsColumnId,
} from '@/lib/deliberations-types';

const DeliberationsKanban = dynamic(
  () =>
    import('@/components/deliberations-kanban').then((m) => m.DeliberationsKanban),
  { loading: () => <PageLoading className="min-h-[40vh]" />, ssr: false },
);

interface DeliberationsResponse {
  team: { id: number; name: string };
  round: { id: number; label: string; status: string };
  board: DeliberationsBoardData;
  selectionComplete?: boolean;
  canSave?: boolean;
  canFinalize?: boolean;
  phasePreview?: boolean;
  pipelineClosed?: boolean;
  /** When set, overrides pipelineClosed for board interactivity (admin stays writable). */
  readOnly?: boolean;
  error?: string;
}

function defaultAdminBoardUrl(teamId: number) {
  return `/api/admin/teams/${teamId}/deliberations`;
}

function defaultAdminDetailUrl(teamId: number, applicationId: number) {
  return `/api/admin/teams/${teamId}/deliberations/${applicationId}`;
}

export function DeliberationsTeamBoard({
  teamId,
  onTeamMeta,
  boardApiBase,
  detailApiBase,
  canSave = true,
}: {
  teamId: number;
  /** Called once the board loads so the tab strip can show the real team name. */
  onTeamMeta?: (meta: { id: number; name: string }) => void;
  /**
   * GET (and PUT when canSave) URL for the board.
   * Admin default: `/api/admin/teams/{id}/deliberations`
   * Team: `/api/team/deliberations?teamId={id}`
   */
  boardApiBase?: string;
  /**
   * Base for candidate detail GETs. Append `/{applicationId}` (admin) or
   * `/{applicationId}?teamId=` (team). When omitted, admin path is used.
   */
  detailApiBase?: string;
  /** Only admins may persist the shared board / advance. Defaults true for admin workspace. */
  canSave?: boolean;
}) {
  const router = useRouter();
  const onTeamMetaRef = useRef(onTeamMeta);
  onTeamMetaRef.current = onTeamMeta;
  const boardUrl = boardApiBase ?? defaultAdminBoardUrl(teamId);
  const [data, setData] = useState<DeliberationsResponse | null>(null);
  const [initialColumns, setInitialColumns] = useState<Record<
    DeliberationsColumnId,
    DeliberationsCandidate[]
  > | null>(null);
  const [savedLayout, setSavedLayout] = useState<DeliberationsBoardLayout | null>(null);
  const [selectionComplete, setSelectionComplete] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const resolveDetailUrl = (applicationId: number) => {
    if (detailApiBase) {
      // Team API: `/api/team/deliberations/{id}?teamId=`
      if (detailApiBase.includes('/api/team/')) {
        return `${detailApiBase}/${applicationId}?teamId=${teamId}`;
      }
      return `${detailApiBase}/${applicationId}`;
    }
    return defaultAdminDetailUrl(teamId, applicationId);
  };

  const resolveBatchDetailsUrl = (applicationIds: number[]) => {
    if (detailApiBase?.includes('/api/team/')) {
      return `/api/team/deliberations/details?teamId=${teamId}&ids=${applicationIds.join(',')}`;
    }
    return `/api/admin/teams/${teamId}/deliberations/details?ids=${applicationIds.join(',')}`;
  };

  const loadBoard = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(boardUrl, { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        const json = (await res.json()) as DeliberationsResponse;
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load deliberations.');
        }
        return json;
      })
      .then((json) => {
        if (cancelled || !json) return;
        setData(json);
        setSavedLayout(json.board.layout ?? null);
        setSelectionComplete(Boolean(json.selectionComplete));
        setInitialColumns(
          applyDeliberationsLayout(json.board.candidates, json.board.layout),
        );
        onTeamMetaRef.current?.({ id: json.team.id, name: json.team.name });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load deliberations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardUrl, router]);

  useEffect(() => {
    return loadBoard();
  }, [loadBoard, reloadKey]);

  if (loading) return <PageLoading />;

  if (error || !data || !initialColumns) {
    return <StatusBanner type="error" message={error || 'Unable to load board.'} />;
  }

  const effectiveCanSave = data.canSave ?? canSave;
  const effectiveCanFinalize = data.canFinalize ?? effectiveCanSave;
  // Prefer explicit readOnly from API (admin stays writable when closed).
  const readOnly =
    data.readOnly !== undefined ? Boolean(data.readOnly) : Boolean(data.pipelineClosed);

  const candidateCount = data.board.candidates.length;

  return (
    <div className="space-y-4">
      {readOnly && (
        <StatusBanner
          type="info"
          message="Recruitment is closed. Deliberations are view-only."
        />
      )}
      {candidateCount === 0 && !data.phasePreview && (
        <StatusBanner
          type="info"
          message="No candidates in this phase yet. Advance applicants from earlier phases to populate the board."
        />
      )}
      <DeliberationsBoardInstructions
        canSave={effectiveCanSave}
        canEditAcceptCap={effectiveCanSave}
        canFinalize={effectiveCanFinalize}
        readOnly={readOnly}
        selectionComplete={selectionComplete}
        phasePreview={Boolean(data.phasePreview)}
      />
      <DeliberationsKanban
        key={`${data.team.id}-${data.round.id}-${reloadKey}-${candidateCount}-fr${data.board.candidates.filter((c) => c.firstRoundAverage != null).length}`}
        teamId={data.team.id}
        initialColumns={initialColumns}
        initialSavedLayout={savedLayout}
        acceptLimit={data.board.acceptLimit}
        allowOverCap={data.board.allowOverCap}
        teamName={data.team.name}
        canSave={effectiveCanSave}
        canEditAcceptCap={effectiveCanSave}
        canFinalize={effectiveCanFinalize}
        readOnly={readOnly}
        selectionComplete={selectionComplete}
        saveUrl={effectiveCanSave ? boardUrl : undefined}
        resolveDetailUrl={resolveDetailUrl}
        resolveBatchDetailsUrl={resolveBatchDetailsUrl}
        onFinalized={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}
