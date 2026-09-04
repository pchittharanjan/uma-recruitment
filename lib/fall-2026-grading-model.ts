import rawModels from '@/lib/fall-2026-grading-model.json';
import { normalizeHeaderText } from '@/lib/rubric';
import type { TeamGradingModel, TeamGradingModels } from '@/lib/grading-model-types';
import {
  applicationCriterionKeys,
  applicationCsvFields,
  getApplicationComponent,
  portfolioCsvField,
} from '@/lib/grading-model';
import type { TeamName } from '@/lib/db';

type RawModels = TeamGradingModels & {
  [K in TeamName]: TeamGradingModel & {
    csvFieldMap?: Record<string, string>;
  };
};

const raw = rawModels as RawModels;

function hydrateCsvFields(team: TeamName): TeamGradingModel {
  const entry = raw[team];
  const map = entry.csvFieldMap ?? {};
  const app = getApplicationComponent(entry);
  if (!app) return { components: entry.components };

  const appQIds = ['app-q1', 'app-q2', 'app-q3', 'app-q4', 'portfolio'];
  const questions = app.questions.map((q, i) => {
    const key = appQIds[i];
    const csvField = key ? map[key] : undefined;
    const hydrated = { ...q, ...(csvField ? { csvField } : {}) };
    if (team === 'Events' && q.id === 'app-q3') {
      const extras = [map['app-q3-visual']].filter(Boolean) as string[];
      if (extras.length > 0) hydrated.csvFields = extras;
    }
    if (team === 'Design' && q.id === 'portfolio' && map.portfolio) {
      hydrated.csvField = map.portfolio;
    }
    return hydrated;
  });

  return {
    components: entry.components.map((c) =>
      c.id === 'application' ? { ...c, questions } : c,
    ),
  };
}

const models: TeamGradingModels = {
  Strategy: hydrateCsvFields('Strategy'),
  Events: hydrateCsvFields('Events'),
  Design: hydrateCsvFields('Design'),
};

export function getFall2026GradingModel(team: TeamName): TeamGradingModel {
  return models[team];
}

export function getAllFall2026Models(): TeamGradingModels {
  return models;
}

/** True when CSV looks like the Fall 2026 Google Form export. */
export function isFall2026ApplicationCsv(headers: string[]): boolean {
  const normalized = headers.map(normalizeHeaderText);
  const required = [
    'why uma',
    'are you applying to strategy',
    'are you applying to events',
    'are you applying to design',
    'duolingo',
  ];
  return required.every((needle) => normalized.some((h) => h.includes(needle)));
}

export interface Fall2026RoundRubric {
  scoreFields: string[];
  customScoreFields: string[];
  portfolioFields: string[];
  gradingModel: TeamGradingModel;
  graderInstructions: string;
}

/** Match a csvFieldMap / model header onto the live CSV column (whitespace/newlines tolerant). */
export function findMatchingHeader(expected: string, headers: string[]): string | undefined {
  const normExpected = normalizeHeaderText(expected);
  if (!normExpected) return undefined;

  const exact = headers.find((header) => normalizeHeaderText(header) === normExpected);
  if (exact) return exact;

  return headers.find((header) => {
    const norm = normalizeHeaderText(header);
    return norm.includes(normExpected) || normExpected.includes(norm);
  });
}

/**
 * Map Fall 2026 model CSV field names onto actual spreadsheet headers.
 * Portfolio links stay out of scoreFields (Design/Events handle them separately).
 */
export function buildFall2026RoundRubric(
  team: TeamName,
  csvHeaders: string[],
): Fall2026RoundRubric | null {
  if (!isFall2026ApplicationCsv(csvHeaders)) return null;

  const model = getFall2026GradingModel(team);
  const portfolioExpected = portfolioCsvField(model);
  const portfolioMatched = portfolioExpected
    ? findMatchingHeader(portfolioExpected, csvHeaders)
    : undefined;

  const scoreFields: string[] = [];
  for (const expected of applicationCsvFields(model)) {
    const matched = findMatchingHeader(expected, csvHeaders);
    if (!matched) continue;
    if (portfolioMatched && matched === portfolioMatched) continue;
    if (!scoreFields.includes(matched)) scoreFields.push(matched);
  }

  const portfolioFields = portfolioMatched ? [portfolioMatched] : [];
  const customScoreFields = applicationCriterionKeys(model);

  if (scoreFields.length === 0 || customScoreFields.length === 0) return null;

  return {
    scoreFields,
    customScoreFields,
    portfolioFields,
    gradingModel: model,
    graderInstructions:
      'Score each criterion 1–5 using the anchors shown. Criteria roll up into weighted question and application scores per the Fall 2026 scorecard.',
  };
}

/** Teams whose Fall 2026 scorecard includes this CSV column as a scored essay (not portfolio). */
export function fall2026ScoringTeamsForHeader(
  header: string,
  csvHeaders: string[],
  teams: TeamName[] = ['Strategy', 'Events', 'Design'],
): TeamName[] {
  if (!isFall2026ApplicationCsv(csvHeaders)) return [];
  return teams.filter((team) => {
    const rubric = buildFall2026RoundRubric(team, csvHeaders);
    return rubric?.scoreFields.includes(header) ?? false;
  });
}

/**
 * Build per-team score field sets from Fall 2026 csvFieldMap (fuzzy-matched).
 * Same source of truth Restore uses via {@link fall2026ScoringTeamsForHeader}.
 */
export function buildFall2026ScoreFieldSets(
  csvHeaders: string[],
  teams: TeamName[] = ['Strategy', 'Events', 'Design'],
): Record<TeamName, Set<string>> | null {
  if (!isFall2026ApplicationCsv(csvHeaders)) return null;
  const next: Record<TeamName, Set<string>> = {
    Strategy: new Set(),
    Events: new Set(),
    Design: new Set(),
  };
  for (const header of csvHeaders) {
    for (const team of fall2026ScoringTeamsForHeader(header, csvHeaders, teams)) {
      next[team].add(header);
    }
  }
  return next;
}

/** Every CSV header Fall 2026 treats as a scored application essay (any team). */
export function fall2026ScoredHeaders(
  csvHeaders: string[],
  teams: TeamName[] = ['Strategy', 'Events', 'Design'],
): Set<string> {
  const sets = buildFall2026ScoreFieldSets(csvHeaders, teams);
  if (!sets) return new Set();
  return new Set([...sets.Strategy, ...sets.Events, ...sets.Design]);
}

/** Design/Events collect portfolio links; Strategy application grading does not. */
export function teamUsesApplicationPortfolio(team: TeamName): boolean {
  return Boolean(portfolioCsvField(getFall2026GradingModel(team)));
}

/** Map Fall 2026 rubric questions onto this round's CSV column names. */
export function hydrateFall2026ModelFromRound(
  team: TeamName,
  csvHeaders: string[],
  scoreFields: string[],
): TeamGradingModel {
  const base = getFall2026GradingModel(team);
  const app = getApplicationComponent(base);
  if (!app) return base;

  const headers = [...new Set([...csvHeaders, ...scoreFields])];
  const questions = app.questions
    .filter((question) => question.id !== 'portfolio' || teamUsesApplicationPortfolio(team))
    .map((question) => {
      const candidates = [question.csvField, ...(question.csvFields ?? [])].filter(
        Boolean,
      ) as string[];

      let csvField = question.csvField;
      for (const candidate of candidates) {
        const match = findMatchingHeader(candidate, headers);
        if (match) {
          csvField = match;
          break;
        }
      }

      if (!csvField && question.id.startsWith('app-q')) {
        const questionIndex = Number.parseInt(question.id.replace('app-q', ''), 10) - 1;
        if (questionIndex >= 0 && scoreFields[questionIndex]) {
          csvField = scoreFields[questionIndex];
        }
      }

      const hydrated = { ...question, ...(csvField ? { csvField } : {}) };
      if (question.csvFields?.length) {
        hydrated.csvFields = question.csvFields
          .map((extra) => findMatchingHeader(extra, headers) ?? extra)
          .filter((extra) =>
            headers.some((header) => normalizeHeaderText(header) === normalizeHeaderText(extra)),
          );
      }
      return hydrated;
    });

  return {
    components: base.components.map((component) =>
      component.id === 'application' ? { ...component, questions } : component,
    ),
  };
}

export const FALL_2026_GRADER_INSTRUCTIONS =
  'Score each criterion 1–5 using the anchors shown. Add notes on each question. Criteria roll up into weighted question and application scores per the Fall 2026 scorecard.';
