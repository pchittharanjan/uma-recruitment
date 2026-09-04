export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getTeamAdvancementCapState } from '@/lib/team-advancement-caps';
import {
  blindAdvancementSubmission,
  getAdvancementPreview,
  getLatestAdvancementSubmission,
  isAdvancementReadOnly,
  listAdvancementSubmissionHistory,
  submitTeamAdvancement,
  type AdvancementFromStage,
} from '@/lib/advancement-submissions';
import {
  resolveAdvancementSelectionMax,
  resolveAdvancementSelectionMin,
  teamAllowsUncappedFirstRoundAdvancement,
} from '@/lib/advancement-cap-helpers';
import { forbidden, unauthorized } from '@/lib/auth';
import { userHasTeamAccess } from '@/lib/access';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { isTeamDirector } from '@/lib/directors';
import { getTeamById } from '@/lib/db';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getRecruitmentCycleLabel } from '@/lib/org-recruitment-cycle-server';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

function parseFromStage(value: string | null): AdvancementFromStage {
  return value === 'first_round' ? 'first_round' : 'application';
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const fromStage = parseFromStage(req.nextUrl.searchParams.get('fromStage'));
    const allowedRoles =
      fromStage === 'first_round' ? (['exec', 'ad_hoc_exec'] as const) : (['exec'] as const);
    const user = await requireTeamPortalUser(req, { roles: [...allowedRoles] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (!(await userHasTeamAccess(user, teamId))) return forbidden();

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const preview = await getAdvancementPreview(teamId, round.id, fromStage, {
      viewerUserId: user.id,
    });
    const submission = await getLatestAdvancementSubmission(teamId, round.id, fromStage);
    const history = await listAdvancementSubmissionHistory(teamId, round.id, fromStage);
    const readOnly = isAdvancementReadOnly(round.status, fromStage);
    const canSubmit =
      user.role === 'exec' && (await isTeamDirector(user.id, teamId));
    const isDirector = canSubmit;

    const serializedSubmission =
      submission && fromStage === 'application'
        ? blindAdvancementSubmission(submission)
        : submission;
    const serializedHistory =
      fromStage === 'application' ? history.map(blindAdvancementSubmission) : history;
    const recruitmentCycleLabel = await getRecruitmentCycleLabel();
    const { cap: advancementCap, overCapExtra } = await getTeamAdvancementCapState(
      teamId,
      fromStage,
    );
    const team = await getTeamById(teamId);
    const allowUncapped =
      fromStage === 'first_round' &&
      Boolean(team?.name && teamAllowsUncappedFirstRoundAdvancement(team.name));
    const previousSubmittedCount =
      submission?.status === 'submitted' ? submission.candidates.length : null;
    const selectionMin = resolveAdvancementSelectionMin({
      cap: advancementCap,
      totalRanked: preview.totalApplications,
      overCapExtra,
      allowUncapped,
    });
    const selectionMax = resolveAdvancementSelectionMax({
      cap: advancementCap,
      totalRanked: preview.totalApplications,
      overCapExtra,
      previousSubmittedCount,
      allowUncapped,
    });

    return NextResponse.json({
      teamId,
      teamName: team?.name ?? null,
      fromStage,
      round: { id: round.id, label: recruitmentCycleLabel, status: round.status },
      preview,
      submission: serializedSubmission,
      history: serializedHistory,
      readOnly,
      canSubmit,
      advancementCap,
      overCapExtra,
      selectionMin,
      selectionMax,
      allowUncappedFirstRound: allowUncapped,
      currentUser: {
        id: user.id,
        name: user.name,
        role: user.role,
        isExec: user.role === 'exec',
        isDirector,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireTeamPortalUser(req, { roles: ['exec'] });
    if (!user) return unauthorized();

    const body = await req.json();
    const teamId = body.teamId as number | undefined;
    const applicationIds = body.applicationIds as number[] | undefined;
    const fromStage = parseFromStage(
      typeof body.fromStage === 'string' ? body.fromStage : null,
    );

    if (!teamId || !Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }
    if (
      applicationIds !== undefined &&
      (!Array.isArray(applicationIds) ||
        !applicationIds.every((id) => typeof id === 'number' && Number.isFinite(id)))
    ) {
      return NextResponse.json({ error: 'applicationIds must contain valid numbers.' }, { status: 400 });
    }

    const submission = await submitTeamAdvancement(user, teamId, fromStage, applicationIds);
    const serialized =
      fromStage === 'application' ? blindAdvancementSubmission(submission) : submission;
    return NextResponse.json({
      success: true,
      submission: serialized,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('access') ||
        message.includes('Only team Directors')
        ? 403
        : message.includes('pending') ||
            message.includes('approved') ||
            message.includes('between') ||
            message.includes('assignments') ||
            message.includes('need grading') ||
            message.includes('need scoring') ||
            message.includes('graded first') ||
            message.includes('interviewed first') ||
            message.includes('stage') ||
            message.includes('Select exactly') ||
            message.includes('Select up to') ||
            message.includes('Select at least') ||
            message.includes('Select at most') ||
            message.includes('Select between') ||
            message.includes('over the current limit') ||
            message.includes('not configured')
          ? 400
          : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
