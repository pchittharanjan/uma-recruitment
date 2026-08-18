'use client'

import { useEffect, useMemo, useState } from 'react'
import { Columns2Icon, XIcon } from 'lucide-react'
import ToggleGroupVertical, {
  type CompareLayoutMode,
} from '@/components/shadcn-studio/toggle-group/toggle-group-05'
import { DeliberationsCandidateDetailPanel } from '@/components/deliberations-candidate-detail'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { displayApplicantId } from '@/lib/applicant-id'
import type {
  DeliberationsCandidate,
  DeliberationsCandidateDetail,
} from '@/lib/deliberations-types'
import { cn } from '@/lib/utils'

const LAYOUT_CAP: Record<CompareLayoutMode, number> = {
  col: 2,
  layout: 4,
  list: 8,
}

function layoutGridClass(mode: CompareLayoutMode, count: number): string {
  if (mode === 'list') return 'grid-cols-1'
  if (mode === 'col') return 'grid-cols-1 md:grid-cols-2'
  if (count <= 2) return 'grid-cols-1 md:grid-cols-2'
  return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
}

export function ApplicantCompareDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  candidates,
  onToggleRejected,
  onRemove,
  resolveDetailUrl,
  resolveBatchDetailsUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: number
  teamName: string
  candidates: DeliberationsCandidate[]
  onToggleRejected: (candidateId: string) => void
  onRemove: (candidateId: string) => void
  resolveDetailUrl?: (applicationId: number) => string
  /** Batch GET URL for visible application ids (admin or team). */
  resolveBatchDetailsUrl?: (applicationIds: number[]) => string
}) {
  const [layout, setLayout] = useState<CompareLayoutMode>('col')
  const cap = LAYOUT_CAP[layout]
  const visible = candidates.slice(0, cap)
  const hiddenCount = Math.max(0, candidates.length - visible.length)

  const visibleIdsKey = useMemo(
    () =>
      candidates
        .slice(0, cap)
        .map((c) => c.applicationId)
        .join(','),
    [candidates, cap],
  )
  const visibleIds = useMemo(() => {
    if (!visibleIdsKey) return [] as number[]
    return visibleIdsKey.split(',').map((id) => Number.parseInt(id, 10))
  }, [visibleIdsKey])

  const detailUrlFor =
    resolveDetailUrl ??
    ((applicationId: number) =>
      `/api/admin/teams/${teamId}/deliberations/${applicationId}`)

  const batchUrl = useMemo(() => {
    if (visibleIds.length === 0) return null
    if (resolveBatchDetailsUrl) return resolveBatchDetailsUrl(visibleIds)
    return `/api/admin/teams/${teamId}/deliberations/details?ids=${visibleIdsKey}`
  }, [visibleIds, visibleIdsKey, teamId, resolveBatchDetailsUrl])

  const [detailsById, setDetailsById] = useState<
    Record<number, DeliberationsCandidateDetail>
  >({})
  const [loadedBatchUrl, setLoadedBatchUrl] = useState<string | null>(null)
  const [batchError, setBatchError] = useState('')
  // Prefer loading over a previous error when the request key changes.
  const batchLoading = Boolean(open && batchUrl && loadedBatchUrl !== batchUrl)

  useEffect(() => {
    if (!open || !batchUrl) return
    let cancelled = false
    fetch(batchUrl, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as {
          details?: DeliberationsCandidateDetail[]
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !json.details) {
          setBatchError(json.error ?? 'Failed to load applicants.')
          setLoadedBatchUrl(batchUrl)
          return
        }
        const next: Record<number, DeliberationsCandidateDetail> = {}
        for (const detail of json.details) {
          next[detail.applicationId] = detail
        }
        setDetailsById(next)
        setBatchError('')
        setLoadedBatchUrl(batchUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setBatchError('Failed to load applicants.')
          setLoadedBatchUrl(batchUrl)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, batchUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[min(92vh,56rem)] w-full max-w-[min(96rem,calc(100%-1.5rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96rem,calc(100%-1.5rem))]"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 sm:px-5">
          <DialogTitle>Compare applicants</DialogTitle>
          <DialogDescription>
            {visible.length} of {candidates.length} selected
            {hiddenCount > 0 ? ` · showing ${cap} in this layout` : ''}. Use the
            layout control for 2-up, 4-up, or list.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="flex shrink-0 flex-col border-r border-border bg-background px-2 py-3">
            <ToggleGroupVertical value={layout} onValueChange={setLayout} />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {visible.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                Add applicants from the board menu to compare them here.
              </p>
            ) : batchLoading ? (
              <div className={cn('grid gap-3', layoutGridClass(layout, visible.length))}>
                {visible.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="display-panel flex min-h-0 flex-col overflow-hidden"
                  >
                    <div className="border-b border-border px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {candidate.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Row {displayApplicantId(candidate.rowIndex)}
                      </p>
                    </div>
                    <div className="space-y-3 px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-40 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : batchError ? (
              <p className="px-1 py-6 text-sm text-destructive">{batchError}</p>
            ) : (
              <div className={cn('grid gap-3', layoutGridClass(layout, visible.length))}>
                {visible.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="display-panel flex min-h-0 flex-col overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {candidate.name}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          Row {displayApplicantId(candidate.rowIndex)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 text-muted-foreground"
                        aria-label={`Remove ${candidate.name} from compare`}
                        onClick={() => onRemove(candidate.id)}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <DeliberationsCandidateDetailPanel
                        teamId={teamId}
                        teamName={teamName}
                        applicationId={candidate.applicationId}
                        rejected={candidate.rejected}
                        onToggleRejected={() => onToggleRejected(candidate.id)}
                        detailUrl={detailUrlFor(candidate.applicationId)}
                        initialDetail={detailsById[candidate.applicationId]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ApplicantCompareBar({
  count,
  onCompare,
  onClear,
}: {
  count: number
  onCompare: () => void
  onClear: () => void
}) {
  if (count === 0) return null

  return (
    <div className="sticky top-0 z-20 flex w-full max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-popover/95 px-3 py-2 backdrop-blur-sm">
      <Columns2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {count} selected for compare
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={onCompare}>
          Compare
        </Button>
      </div>
    </div>
  )
}
