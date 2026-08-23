import 'server-only';

import { getDb, type RoundStatus } from '@/lib/db';
import {
  applyCommunicationTemplate,
  defaultsForOutcomeEmailStage,
  type RoundCommunicationsTemplates,
} from '@/lib/communication-templates';
import {
  type OutcomeEmailStage,
  outcomeEmailStageFromPipeline,
  parseOutcomeEmailStage,
} from '@/lib/communications-stages';

export type { RoundCommunicationsTemplates } from '@/lib/communication-templates';
export { applyCommunicationTemplate } from '@/lib/communication-templates';
export type { OutcomeEmailStage } from '@/lib/communications-stages';
export {
  communicationsHref,
  outcomeEmailPageDescription,
  outcomeEmailPassCardTitle,
  outcomeEmailPhaseEyebrow,
  outcomeEmailStageFromPipeline,
  outcomeEmailTargetLabel,
  parseOutcomeEmailStage,
} from '@/lib/communications-stages';

export interface CommunicationRecipient {
  applicationId: number;
  name: string;
  email: string;
}

export interface RoundCommunicationsData {
  fromStage: OutcomeEmailStage;
  templates: RoundCommunicationsTemplates;
  passRecipients: CommunicationRecipient[];
  rejectRecipients: CommunicationRecipient[];
  passNotifiedAt: number | null;
  rejectNotifiedAt: number | null;
}

export interface OutcomeEmailStatus {
  teamId: number;
  roundId: number;
  fromStage: OutcomeEmailStage;
  passCount: number;
  rejectCount: number;
  passNotifiedAt: number | null;
  rejectNotifiedAt: number | null;
  complete: boolean;
}

function outcomeEmailsComplete(
  passCount: number,
  rejectCount: number,
  passNotifiedAt: number | null,
  rejectNotifiedAt: number | null,
): boolean {
  // Empty pass+reject pools means decisions aren't finalized yet — not "done".
  // (Previously this returned true and falsely completed checklist email steps.)
  if (passCount === 0 && rejectCount === 0) return false;
  const passOk = passCount === 0 || passNotifiedAt !== null;
  const rejectOk = rejectCount === 0 || rejectNotifiedAt !== null;
  return passOk && rejectOk;
}

function mapRecipients(
  rows: Array<Record<string, unknown>>,
): CommunicationRecipient[] {
  return rows.map((row) => ({
    applicationId: row.id as number,
    name: row.name as string,
    email: row.email as string,
  }));
}

/**
 * Pass / reject pools for each email moment.
 *
 * application: advanced past application vs cut at application (never interviewed).
 * first_round: advanced to final vs cut after first-round interviews.
 * final_round: offered (advanced) vs cut after final-round interviews.
 */
async function loadPassRecipients(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage,
): Promise<CommunicationRecipient[]> {
  const db = getDb();

  if (fromStage === 'application') {
    const result = await db.execute({
      sql: `SELECT app.id, c.name, c.email
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ?
              AND app.stage IN ('first_round', 'final_round', 'deliberations', 'advanced')
            ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
      args: [teamId, roundId],
    });
    return mapRecipients(result.rows as Array<Record<string, unknown>>);
  }

  if (fromStage === 'first_round') {
    const result = await db.execute({
      sql: `SELECT app.id, c.name, c.email
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ?
              AND app.stage IN ('final_round', 'deliberations', 'advanced')
            ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
      args: [teamId, roundId],
    });
    return mapRecipients(result.rows as Array<Record<string, unknown>>);
  }

  // final_round / deliberations offer emails
  const result = await db.execute({
    sql: `SELECT app.id, c.name, c.email
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'advanced'
          ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
    args: [teamId, roundId],
  });
  return mapRecipients(result.rows as Array<Record<string, unknown>>);
}

async function loadRejectRecipients(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage,
): Promise<CommunicationRecipient[]> {
  const db = getDb();

  if (fromStage === 'application') {
    // Cut at application: rejected_from_stage = application, or legacy heuristic.
    const result = await db.execute({
      sql: `SELECT app.id, c.name, c.email
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
              AND (
                app.rejected_from_stage = 'application'
                OR (
                  app.rejected_from_stage IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'first_round'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'first_round'
                  )
                )
              )
            ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
      args: [teamId, roundId],
    });
    return mapRecipients(result.rows as Array<Record<string, unknown>>);
  }

  if (fromStage === 'first_round') {
    // Cut after first round (not later deliberations cuts).
    const result = await db.execute({
      sql: `SELECT app.id, c.name, c.email
            FROM applications app
            JOIN candidates c ON c.id = app.candidate_id
            WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
              AND (
                app.rejected_from_stage = 'first_round'
                OR (
                  app.rejected_from_stage IS NULL
                  AND (
                    EXISTS (
                      SELECT 1 FROM assignments a
                      WHERE a.application_id = app.id AND a.stage = 'first_round'
                    )
                    OR EXISTS (
                      SELECT 1 FROM interview_slots s
                      WHERE s.application_id = app.id AND s.stage = 'first_round'
                    )
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'final_round'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'final_round'
                  )
                )
              )
            ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
      args: [teamId, roundId],
    });
    return mapRecipients(result.rows as Array<Record<string, unknown>>);
  }

  // Cut after final round / deliberations.
  const result = await db.execute({
    sql: `SELECT app.id, c.name, c.email
          FROM applications app
          JOIN candidates c ON c.id = app.candidate_id
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
            AND (
              app.rejected_from_stage IN ('final_round', 'deliberations')
              OR (
                app.rejected_from_stage IS NULL
                AND (
                  EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'final_round'
                  )
                  OR EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'final_round'
                  )
                )
              )
            )
          ORDER BY app.rank IS NULL, app.rank ASC, app.row_index ASC`,
    args: [teamId, roundId],
  });
  return mapRecipients(result.rows as Array<Record<string, unknown>>);
}

export async function getRoundCommunications(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage = 'application',
): Promise<RoundCommunicationsData> {
  const db = getDb();
  const defaults = defaultsForOutcomeEmailStage(fromStage);

  const rowResult = await db.execute({
    sql: `SELECT * FROM round_outcome_emails
          WHERE round_id = ? AND from_stage = ?`,
    args: [roundId, fromStage],
  });

  const row = rowResult.rows[0];
  const templates: RoundCommunicationsTemplates = {
    passSubject: (row?.pass_subject as string | null) ?? defaults.passSubject,
    passBody: (row?.pass_body as string | null) ?? defaults.passBody,
    rejectSubject: (row?.reject_subject as string | null) ?? defaults.rejectSubject,
    rejectBody: (row?.reject_body as string | null) ?? defaults.rejectBody,
  };

  const [passRecipients, rejectRecipients] = await Promise.all([
    loadPassRecipients(teamId, roundId, fromStage),
    loadRejectRecipients(teamId, roundId, fromStage),
  ]);

  return {
    fromStage,
    templates,
    passRecipients,
    rejectRecipients,
    passNotifiedAt: (row?.pass_notified_at as number | null) ?? null,
    rejectNotifiedAt: (row?.reject_notified_at as number | null) ?? null,
  };
}

export async function saveRoundCommunications(
  roundId: number,
  fromStage: OutcomeEmailStage,
  templates: RoundCommunicationsTemplates,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO round_outcome_emails (
            round_id, from_stage, pass_subject, pass_body, reject_subject, reject_body
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(round_id, from_stage) DO UPDATE SET
            pass_subject = excluded.pass_subject,
            pass_body = excluded.pass_body,
            reject_subject = excluded.reject_subject,
            reject_body = excluded.reject_body`,
    args: [
      roundId,
      fromStage,
      templates.passSubject,
      templates.passBody,
      templates.rejectSubject,
      templates.rejectBody,
    ],
  });
}

export async function markOutcomeNotificationsSent(
  roundId: number,
  fromStage: OutcomeEmailStage,
  which: 'pass' | 'reject' | 'both',
): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Ensure a row exists so ON CONFLICT updates work for notified_at-only writes.
  await db.execute({
    sql: `INSERT INTO round_outcome_emails (round_id, from_stage)
          VALUES (?, ?)
          ON CONFLICT(round_id, from_stage) DO NOTHING`,
    args: [roundId, fromStage],
  });

  if (which === 'pass' || which === 'both') {
    await db.execute({
      sql: `UPDATE round_outcome_emails
            SET pass_notified_at = ?
            WHERE round_id = ? AND from_stage = ?`,
      args: [now, roundId, fromStage],
    });
  }
  if (which === 'reject' || which === 'both') {
    await db.execute({
      sql: `UPDATE round_outcome_emails
            SET reject_notified_at = ?
            WHERE round_id = ? AND from_stage = ?`,
      args: [now, roundId, fromStage],
    });
  }
}

/** COUNT-only pass pool — same filters as loadPassRecipients, no candidate rows. */
async function countPassRecipients(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage,
): Promise<number> {
  const db = getDb();

  if (fromStage === 'application') {
    const result = await db.execute({
      sql: `SELECT COUNT(*) AS count FROM applications app
            WHERE app.team_id = ? AND app.round_id = ?
              AND app.stage IN ('first_round', 'final_round', 'deliberations', 'advanced')`,
      args: [teamId, roundId],
    });
    return (result.rows[0]?.count as number) ?? 0;
  }

  if (fromStage === 'first_round') {
    const result = await db.execute({
      sql: `SELECT COUNT(*) AS count FROM applications app
            WHERE app.team_id = ? AND app.round_id = ?
              AND app.stage IN ('final_round', 'deliberations', 'advanced')`,
      args: [teamId, roundId],
    });
    return (result.rows[0]?.count as number) ?? 0;
  }

  const result = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM applications app
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'advanced'`,
    args: [teamId, roundId],
  });
  return (result.rows[0]?.count as number) ?? 0;
}

/** COUNT-only reject pool — same filters as loadRejectRecipients, no candidate rows. */
async function countRejectRecipients(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage,
): Promise<number> {
  const db = getDb();

  if (fromStage === 'application') {
    const result = await db.execute({
      sql: `SELECT COUNT(*) AS count FROM applications app
            WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
              AND (
                app.rejected_from_stage = 'application'
                OR (
                  app.rejected_from_stage IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'first_round'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'first_round'
                  )
                )
              )`,
      args: [teamId, roundId],
    });
    return (result.rows[0]?.count as number) ?? 0;
  }

  if (fromStage === 'first_round') {
    const result = await db.execute({
      sql: `SELECT COUNT(*) AS count FROM applications app
            WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
              AND (
                app.rejected_from_stage = 'first_round'
                OR (
                  app.rejected_from_stage IS NULL
                  AND (
                    EXISTS (
                      SELECT 1 FROM assignments a
                      WHERE a.application_id = app.id AND a.stage = 'first_round'
                    )
                    OR EXISTS (
                      SELECT 1 FROM interview_slots s
                      WHERE s.application_id = app.id AND s.stage = 'first_round'
                    )
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'final_round'
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'final_round'
                  )
                )
              )`,
      args: [teamId, roundId],
    });
    return (result.rows[0]?.count as number) ?? 0;
  }

  const result = await db.execute({
    sql: `SELECT COUNT(*) AS count FROM applications app
          WHERE app.team_id = ? AND app.round_id = ? AND app.stage = 'rejected'
            AND (
              app.rejected_from_stage IN ('final_round', 'deliberations')
              OR (
                app.rejected_from_stage IS NULL
                AND (
                  EXISTS (
                    SELECT 1 FROM assignments a
                    WHERE a.application_id = app.id AND a.stage = 'final_round'
                  )
                  OR EXISTS (
                    SELECT 1 FROM interview_slots s
                    WHERE s.application_id = app.id AND s.stage = 'final_round'
                  )
                )
              )
            )`,
    args: [teamId, roundId],
  });
  return (result.rows[0]?.count as number) ?? 0;
}

/**
 * Status for checklist / admin summary — counts + notified timestamps only.
 * Does not load recipient name/email rows.
 */
export async function getOutcomeEmailStatus(
  teamId: number,
  roundId: number,
  fromStage: OutcomeEmailStage = 'application',
): Promise<OutcomeEmailStatus> {
  const db = getDb();
  const [passCount, rejectCount, rowResult] = await Promise.all([
    countPassRecipients(teamId, roundId, fromStage),
    countRejectRecipients(teamId, roundId, fromStage),
    db.execute({
      sql: `SELECT pass_notified_at, reject_notified_at FROM round_outcome_emails
            WHERE round_id = ? AND from_stage = ?`,
      args: [roundId, fromStage],
    }),
  ]);

  const row = rowResult.rows[0];
  const passNotifiedAt = (row?.pass_notified_at as number | null) ?? null;
  const rejectNotifiedAt = (row?.reject_notified_at as number | null) ?? null;

  return {
    teamId,
    roundId,
    fromStage,
    passCount,
    rejectCount,
    passNotifiedAt,
    rejectNotifiedAt,
    complete: outcomeEmailsComplete(passCount, rejectCount, passNotifiedAt, rejectNotifiedAt),
  };
}

export async function countTeamsWithCompleteOutcomeEmails(
  teams: Array<{ teamId: number; roundId: number }>,
  fromStage: OutcomeEmailStage = 'application',
): Promise<number> {
  if (teams.length === 0) return 0;
  const statuses = await Promise.all(
    teams.map((t) => getOutcomeEmailStatus(t.teamId, t.roundId, fromStage)),
  );
  return statuses.filter((s) => s.complete).length;
}

export function resolveOutcomeEmailStageParam(
  raw: string | null | undefined,
  pipelineStatus?: RoundStatus | null,
): OutcomeEmailStage {
  if (raw) return parseOutcomeEmailStage(raw);
  return outcomeEmailStageFromPipeline(pipelineStatus);
}
