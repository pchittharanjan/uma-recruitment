'use client'

import { useState } from 'react'
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
import { displayApplicantId } from '@/lib/applicant-id'
import type { DeliberationsCandidate } from '@/lib/deliberations-types'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: number
  teamName: string
  candidates: DeliberationsCandidate[]
  onToggleRejected: (candidateId: string) => void
  onRemove: (candidateId: string) => void
  resolveDetailUrl?: (applicationId: number) => string
}) {
  const [layout, setLayout] = useState<CompareLayoutMode>('col')
  const cap = LAYOUT_CAP[layout]
  const visible = candidates.slice(0, cap)
  const hiddenCount = Math.max(0, candidates.length - visible.length)
  const detailUrlFor =
    resolveDetailUrl ??
    ((applicationId: number) =>
      `/api/admin/teams/${teamId}/deliberations/${applicationId}`)

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
          <div className="flex shrink-0 flex-col border-r border-border bg-muted/30 px-2 py-3">
            <ToggleGroupVertical value={layout} onValueChange={setLayout} />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {visible.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted-foreground">
                Add applicants from the board menu to compare them here.
              </p>
            ) : (
              <div className={cn('grid gap-3', layoutGridClass(layout, visible.length))}>
                {visible.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
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
    <div className="sticky top-0 z-20 flex w-full max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-popover/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      <Columns2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {count} selected for compare
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" size="sm" onClick={onCompare} disabled={count < 2}>
          Compare
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  )
}
