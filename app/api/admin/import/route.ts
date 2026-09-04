export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  importUnifiedApplicationRound,
  type ImportProgressEvent,
  type UnifiedImportResult,
} from '@/lib/import-unified';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import type { TeamName } from '@/lib/db';
import type { TeamGradingModel } from '@/lib/grading-model-types';
import type { TeamSplitConfig } from '@/lib/team-split';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

interface GraderInput {
  name: string;
  email: string;
}

type StreamEvent = ImportProgressEvent | { type: 'complete'; result: UnifiedImportResult } | { type: 'error'; message: string };

function encodeEvent(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();
    const pipeline = await getGlobalPipelineState();
    if (pipeline.status !== 'application') {
      return NextResponse.json(
        {
          error:
            'CSV import is only available during Application phase. Advance each team to Application on the dashboard, then import.',
        },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const csvFile = formData.get('csv') as File | null;
    const roundLabel = ((formData.get('roundLabel') as string | null) ?? '').trim();
    const graderInstructions = (formData.get('graderInstructions') as string | null) ?? undefined;

    if (!csvFile) {
      return NextResponse.json({ error: 'Spreadsheet file is required.' }, { status: 400 });
    }

    const teamSplitRaw = formData.get('teamSplitConfig') as string | null;
    if (!teamSplitRaw) {
      return NextResponse.json({ error: 'Team split configuration is required.' }, { status: 400 });
    }

    let teamSplitConfig: TeamSplitConfig;
    try {
      teamSplitConfig = JSON.parse(teamSplitRaw) as TeamSplitConfig;
    } catch {
      return NextResponse.json({ error: 'Invalid team split configuration.' }, { status: 400 });
    }

    const gradersRaw = formData.get('gradersByTeam') as string | null;
    if (!gradersRaw) {
      return NextResponse.json({ error: 'Graders per team are required.' }, { status: 400 });
    }

    let gradersByTeam: Partial<Record<TeamName, GraderInput[]>>;
    try {
      gradersByTeam = JSON.parse(gradersRaw) as Partial<Record<TeamName, GraderInput[]>>;
    } catch {
      return NextResponse.json({ error: 'Invalid graders data.' }, { status: 400 });
    }

    let scoreFieldsByTeam: Partial<Record<TeamName, string[]>> = {};
    const scoreFieldsByTeamRaw = formData.get('scoreFieldsByTeam') as string | null;
    if (scoreFieldsByTeamRaw) {
      try {
        scoreFieldsByTeam = JSON.parse(scoreFieldsByTeamRaw) as Partial<Record<TeamName, string[]>>;
      } catch {
        scoreFieldsByTeam = {};
      }
    }

    let portfolioFieldsByTeam: Partial<Record<TeamName, string[]>> = {};
    const portfolioFieldsByTeamRaw = formData.get('portfolioFieldsByTeam') as string | null;
    if (portfolioFieldsByTeamRaw) {
      try {
        portfolioFieldsByTeam = JSON.parse(portfolioFieldsByTeamRaw) as Partial<
          Record<TeamName, string[]>
        >;
      } catch {
        portfolioFieldsByTeam = {};
      }
    }

    let customScoreFields: string[] = [];
    const customRaw = formData.get('customScoreFields') as string | null;
    if (customRaw) {
      try {
        customScoreFields = JSON.parse(customRaw) as string[];
      } catch {
        customScoreFields = [];
      }
    }

    let gradingModelByTeam: Partial<Record<TeamName, TeamGradingModel>> | undefined;
    const gradingModelByTeamRaw = formData.get('gradingModelByTeam') as string | null;
    if (gradingModelByTeamRaw) {
      try {
        gradingModelByTeam = JSON.parse(gradingModelByTeamRaw) as Partial<
          Record<TeamName, TeamGradingModel>
        >;
      } catch {
        gradingModelByTeam = undefined;
      }
    }

    const spreadsheetBuffer = await csvFile.arrayBuffer();
    let spreadsheet;
    try {
      const { parseSpreadsheetArrayBuffer } = await import('@/lib/spreadsheet');
      spreadsheet = await parseSpreadsheetArrayBuffer(spreadsheetBuffer, csvFile.name);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read spreadsheet.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const contextFieldsRaw = formData.get('contextFields') as string | null;
    let contextFields: string[] = [];
    if (contextFieldsRaw) {
      try {
        contextFields = JSON.parse(contextFieldsRaw) as string[];
      } catch {
        contextFields = [];
      }
    }

    const gradersPerApplicationRaw = formData.get('gradersPerApplication') as string | null;
    const gradersPerApplication = gradersPerApplicationRaw
      ? Number.parseInt(gradersPerApplicationRaw, 10)
      : undefined;

    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: StreamEvent) => {
          controller.enqueue(encodeEvent(event));
        };

        try {
          const result = await importUnifiedApplicationRound({
            roundLabel: roundLabel || 'Application Round',
            spreadsheet,
            scoreFieldsByTeam,
            portfolioFieldsByTeam,
            gradingModelByTeam,
            contextFields,
            customScoreFields,
            teamSplitConfig,
            gradersByTeam,
            graderInstructions,
            gradersPerApplication:
              Number.isFinite(gradersPerApplication) && gradersPerApplication! >= 1
                ? gradersPerApplication
                : undefined,
            invitedByUserId: admin.id,
            onProgress: emit,
          });

          emit({ type: 'complete', result });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Internal server error.';
          emit({ type: 'error', message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error.';
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
