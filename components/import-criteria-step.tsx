'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ClipboardCopy, ClipboardPaste, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getFall2026GradingModel,
  hydrateFall2026ModelFromRound,
  teamUsesApplicationPortfolio,
} from '@/lib/fall-2026-grading-model';
import {
  getApplicationComponent,
  isPrimaryQuestion,
  portfolioCsvField,
  questionsLinkedTo,
} from '@/lib/grading-model';
import type {
  RubricCriterion,
  RubricQuestion,
  TeamGradingModel,
} from '@/lib/grading-model-types';
import type { TeamName } from '@/lib/db';
import { shortHeaderLabel } from '@/lib/rubric';
import { parseSpreadsheetFile } from '@/lib/spreadsheet';
import type { ParsedCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Sentinel for “not grouped” in the Score-together Select (must not collide with question ids). */
const SCORE_ALONE_VALUE = '__alone__';

const CRITERIA_MARKDOWN_ACCEPT = '.md,.txt,.csv,text/markdown,text/plain,text/csv';

function emptyAnchors(): RubricCriterion['anchors'] {
  // New / blank criteria: empty descriptions; UI uses placeholder text only.
  return [1, 2, 3, 4, 5].map((score) => ({ score, description: '' }));
}

function newCriterionId(): string {
  return `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Stable id from criterion name (used by markdown import; CSV uses when id column empty). */
function criterionIdFromName(name: string, usedIds: Set<string>): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = slug || 'criterion';
  let id = slug ? `criterion-${base}` : newCriterionId();
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }
  let n = 2;
  while (usedIds.has(`${id}-${n}`)) n += 1;
  id = `${id}-${n}`;
  usedIds.add(id);
  return id;
}

function normalizeMatchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function newCriterion(): RubricCriterion {
  return {
    id: newCriterionId(),
    name: '',
    weightPct: undefined,
    anchors: emptyAnchors(),
  };
}

/** Split clipboard text into non-empty lines (for bulk-filling score anchors). */
function pasteLinesFromClipboard(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * If the paste is a multi-line list, apply lines to anchors 1–5 (extra lines ignored).
 * Returns updated anchors, or null when paste should proceed normally (single line).
 */
function applyMultilineAnchorPaste(
  anchors: RubricCriterion['anchors'],
  clipboardText: string,
): RubricCriterion['anchors'] | null {
  const lines = pasteLinesFromClipboard(clipboardText);
  if (lines.length < 2) return null;
  return anchors.map((anchor) => {
    const line = lines[anchor.score - 1];
    return line != null ? { ...anchor, description: line } : anchor;
  });
}

function normalizeCriteriaCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function criteriaCsvCell(
  row: Record<string, string>,
  headerByNorm: Map<string, string>,
  aliases: string[],
): string {
  for (const alias of aliases) {
    const key = headerByNorm.get(alias);
    if (!key) continue;
    const value = row[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

/** Apply criteria rows to matching questions on one team's model. Unmatched questions stay as-is. */
export function applyCriteriaCsvToTeamModel(
  model: TeamGradingModel,
  parsed: ParsedCsv,
): { model: TeamGradingModel; matchedQuestions: number; criterionCount: number } {
  const headerByNorm = new Map(
    parsed.headers.map((h) => [normalizeCriteriaCsvHeader(h), h] as const),
  );

  const hasQuestionId = headerByNorm.has('question_id');
  const hasCsvField = headerByNorm.has('csv_field');
  if (!hasQuestionId && !hasCsvField) {
    throw new Error(
      'Criteria CSV needs a question_id column (or csv_field to match the response column).',
    );
  }
  if (!headerByNorm.has('criterion_name') && !headerByNorm.has('name')) {
    throw new Error('Criteria CSV needs a criterion_name column.');
  }

  const app = getApplicationComponent(model);
  if (!app) {
    throw new Error('This team has no application questions to update.');
  }

  const byQuestionId = new Map(app.questions.map((q) => [q.id, q]));
  const byCsvField = new Map<string, RubricQuestion>();
  for (const q of app.questions) {
    if (q.csvField) byCsvField.set(q.csvField, q);
    for (const extra of q.csvFields ?? []) byCsvField.set(extra, q);
  }

  const criteriaByQuestionId = new Map<string, RubricCriterion[]>();
  const unmatchedKeys = new Set<string>();
  const usedCriterionIds = new Set<string>();

  for (const row of parsed.rows) {
    const questionIdRaw = criteriaCsvCell(row, headerByNorm, ['question_id']);
    const csvFieldRaw = criteriaCsvCell(row, headerByNorm, ['csv_field']);
    const name = criteriaCsvCell(row, headerByNorm, ['criterion_name', 'name']);
    if (!name) continue;

    let question: RubricQuestion | undefined;
    if (questionIdRaw) question = byQuestionId.get(questionIdRaw);
    if (!question && csvFieldRaw) question = byCsvField.get(csvFieldRaw);
    if (!question) {
      unmatchedKeys.add(questionIdRaw || csvFieldRaw || '(blank)');
      continue;
    }

    const weightRaw = criteriaCsvCell(row, headerByNorm, [
      'weight_pct',
      'weight',
      'weightpct',
    ]);
    let weightPct: number | undefined;
    if (weightRaw !== '') {
      const parsedWeight = Number.parseFloat(weightRaw);
      if (Number.isFinite(parsedWeight)) weightPct = parsedWeight;
    }

    const explicitId = criteriaCsvCell(row, headerByNorm, ['criterion_id', 'id']);
    let criterionId: string;
    if (explicitId) {
      criterionId = explicitId;
      usedCriterionIds.add(criterionId);
    } else {
      criterionId = criterionIdFromName(name, usedCriterionIds);
    }

    const anchors = emptyAnchors().map((anchor) => ({
      ...anchor,
      description: criteriaCsvCell(row, headerByNorm, [
        `anchor_${anchor.score}`,
        `anchor${anchor.score}`,
      ]),
    }));

    const list = criteriaByQuestionId.get(question.id) ?? [];
    list.push({ id: criterionId, name, weightPct, anchors });
    criteriaByQuestionId.set(question.id, list);
  }

  if (criteriaByQuestionId.size === 0) {
    const hint =
      unmatchedKeys.size > 0
        ? ` No rows matched this team's question IDs (saw: ${[...unmatchedKeys].slice(0, 4).join(', ')}).`
        : '';
    throw new Error(`No criteria rows matched questions on this team.${hint}`);
  }

  const next: TeamGradingModel = {
    components: model.components.map((c) => {
      if (c.id !== 'application') return c;
      return {
        ...c,
        questions: c.questions.map((q) => {
          const imported = criteriaByQuestionId.get(q.id);
          if (!imported) return q;
          // Importing criteria makes this question a primary again.
          return { ...q, criteria: imported, linkedToQuestionId: undefined };
        }),
      };
    }),
  };

  let criterionCount = 0;
  for (const list of criteriaByQuestionId.values()) criterionCount += list.length;

  return {
    model: next,
    matchedQuestions: criteriaByQuestionId.size,
    criterionCount,
  };
}

function stripOptionalMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

/** Trailing `(25%)` / `(25)` on a criterion heading (markdown ### line). */
const CRITERION_WEIGHT_SUFFIX_RE = /\((\d+(?:\.\d+)?)\s*%?\)\s*$/;

/**
 * Parse `### Criterion name (25%)`.
 * Strips every trailing weight token so names that already baked in `(30%)`
 * (or doubled `(30%) (30%)`) store a clean `name` and a single `weightPct`.
 * Prefers the rightmost / explicit ### suffix when multiple weights differ.
 */
function parseCriterionHeading(heading: string): { name: string; weightPct?: number } {
  let name = heading.trim();
  let weightPct: number | undefined;

  // Peel trailing weight suffixes right-to-left. First match = ### line suffix.
  while (true) {
    const weightMatch = name.match(CRITERION_WEIGHT_SUFFIX_RE);
    if (!weightMatch || weightMatch.index == null) break;
    const parsedWeight = Number.parseFloat(weightMatch[1]!);
    if (!Number.isFinite(parsedWeight)) break;
    // Keep the first (rightmost) weight; later peels only clean the name.
    if (weightPct == null) weightPct = parsedWeight;
    name = name.slice(0, weightMatch.index).trim();
  }

  return { name, weightPct };
}

function parseQuestionHeading(heading: string): { questionId?: string; labelText: string } {
  const colon = heading.indexOf(':');
  if (colon > 0) {
    const maybeId = heading.slice(0, colon).trim();
    // question ids look like app-q1 / portfolio — no spaces
    if (/^[a-z][a-z0-9_-]*$/i.test(maybeId)) {
      return {
        questionId: maybeId,
        labelText: heading.slice(colon + 1).trim(),
      };
    }
  }
  return { labelText: heading.trim() };
}

function parseAnchorLine(line: string): { score: number; description: string } | null {
  const match = line.match(/^(?:[-*]\s+)?(\d)[.)]\s+(.*)$/);
  if (!match) return null;
  const score = Number.parseInt(match[1]!, 10);
  if (score < 1 || score > 5) return null;
  return { score, description: match[2]!.trim() };
}

function findQuestionForMarkdownHeading(
  questions: RubricQuestion[],
  heading: string,
): RubricQuestion | undefined {
  const { questionId, labelText } = parseQuestionHeading(heading);
  if (questionId) {
    const byId = questions.find((q) => q.id === questionId);
    if (byId) return byId;
  }

  const labelKey = normalizeMatchKey(labelText || heading);
  if (!labelKey) return undefined;

  const exactLabel = questions.find((q) => normalizeMatchKey(q.label) === labelKey);
  if (exactLabel) return exactLabel;

  const includesLabel = questions.find((q) => {
    const qKey = normalizeMatchKey(q.label);
    return qKey.length > 0 && (labelKey.includes(qKey) || qKey.includes(labelKey));
  });
  if (includesLabel) return includesLabel;

  for (const q of questions) {
    const fields = [
      ...(q.csvField ? [q.csvField] : []),
      ...(q.csvFields ?? []),
    ];
    for (const field of fields) {
      const fieldKey = normalizeMatchKey(field);
      const shortKey = normalizeMatchKey(shortHeaderLabel(field, 80));
      if (
        fieldKey === labelKey ||
        shortKey === labelKey ||
        (fieldKey && labelKey.includes(fieldKey)) ||
        (shortKey && labelKey.includes(shortKey))
      ) {
        return q;
      }
    }
  }

  return undefined;
}

/** Match `# Strategy` / `# Events` / `# Design` (case-insensitive). */
function parseTeamHeading(heading: string): TeamName | null {
  const key = heading.trim().toLowerCase();
  if (key === 'strategy') return 'Strategy';
  if (key === 'events') return 'Events';
  if (key === 'design') return 'Design';
  return null;
}

/**
 * Split a multi-team markdown doc on `# TeamName` headings.
 * Returns null when no recognized team H1s are present (legacy single-team paste).
 */
export function splitCriteriaMarkdownByTeam(
  markdown: string,
): Map<TeamName, string> | null {
  const body = stripOptionalMarkdownFence(markdown);
  const sections = new Map<TeamName, string[]>();
  let currentTeam: TeamName | null = null;
  let foundTeamHeading = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    // H1 only: `# Team` — `##` / `###` do not match (`#` must be followed by whitespace).
    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) {
      const team = parseTeamHeading(h1[1]!);
      if (team) {
        foundTeamHeading = true;
        currentTeam = team;
        if (!sections.has(team)) sections.set(team, []);
        continue;
      }
    }
    if (currentTeam) {
      sections.get(currentTeam)!.push(rawLine);
    }
  }

  if (!foundTeamHeading) return null;

  const out = new Map<TeamName, string>();
  for (const [team, lines] of sections) {
    out.set(team, lines.join('\n'));
  }
  return out;
}

/** Apply markdown criteria blocks to matching questions on one team's model. */
export function applyCriteriaMarkdownToTeamModel(
  model: TeamGradingModel,
  markdown: string,
): { model: TeamGradingModel; matchedQuestions: number; criterionCount: number } {
  const app = getApplicationComponent(model);
  if (!app) {
    throw new Error('This team has no application questions to update.');
  }

  const body = stripOptionalMarkdownFence(markdown);
  if (!body.trim()) {
    throw new Error('Markdown file is empty.');
  }

  const criteriaByQuestionId = new Map<string, RubricCriterion[]>();
  const unmatchedHeadings: string[] = [];
  const usedCriterionIds = new Set<string>();

  let currentQuestionId: string | null = null;
  let currentCriterion: RubricCriterion | null = null;

  const flushCriterion = () => {
    if (!currentQuestionId || !currentCriterion) return;
    if (!currentCriterion.name.trim()) {
      currentCriterion = null;
      return;
    }
    const list = criteriaByQuestionId.get(currentQuestionId) ?? [];
    list.push(currentCriterion);
    criteriaByQuestionId.set(currentQuestionId, list);
    currentCriterion = null;
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip team H1s when parsing a single-team slice (or legacy docs with stray `#`).
    if (trimmed.match(/^#\s+/) && !trimmed.match(/^##/)) {
      continue;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushCriterion();
      currentCriterion = null;
      const question = findQuestionForMarkdownHeading(app.questions, h2[1]!.trim());
      if (!question) {
        unmatchedHeadings.push(h2[1]!.trim());
        currentQuestionId = null;
        continue;
      }
      currentQuestionId = question.id;
      // Fresh list for this question (last ## block wins if duplicated).
      criteriaByQuestionId.set(question.id, []);
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushCriterion();
      if (!currentQuestionId) continue;
      const { name, weightPct } = parseCriterionHeading(h3[1]!.trim());
      if (!name) {
        currentCriterion = null;
        continue;
      }
      currentCriterion = {
        id: criterionIdFromName(name, usedCriterionIds),
        name,
        weightPct,
        anchors: emptyAnchors(),
      };
      continue;
    }

    if (!currentQuestionId || !currentCriterion) continue;

    const anchor = parseAnchorLine(trimmed);
    if (!anchor) continue;
    currentCriterion = {
      ...currentCriterion,
      anchors: currentCriterion.anchors.map((a) =>
        a.score === anchor.score ? { ...a, description: anchor.description } : a,
      ),
    };
  }
  flushCriterion();

  if (criteriaByQuestionId.size === 0) {
    const hint =
      unmatchedHeadings.length > 0
        ? ` No ## headings matched this team's questions (saw: ${unmatchedHeadings
            .slice(0, 4)
            .join('; ')}).`
        : ' Use ## question headings (e.g. ## app-q1: Why UMA) and ### criteria with 1.–5. anchors.';
    throw new Error(`No criteria matched questions on this team.${hint}`);
  }

  // Drop questions that matched a heading but ended with zero named criteria.
  for (const [qid, list] of [...criteriaByQuestionId.entries()]) {
    if (list.length === 0) criteriaByQuestionId.delete(qid);
  }
  if (criteriaByQuestionId.size === 0) {
    throw new Error(
      'Matched question heading(s) but found no ### criteria with names. Add criterion blocks under each ## question.',
    );
  }

  const next: TeamGradingModel = {
    components: model.components.map((c) => {
      if (c.id !== 'application') return c;
      return {
        ...c,
        questions: c.questions.map((q) => {
          const imported = criteriaByQuestionId.get(q.id);
          if (!imported) return q;
          return { ...q, criteria: imported, linkedToQuestionId: undefined };
        }),
      };
    }),
  };

  let criterionCount = 0;
  for (const list of criteriaByQuestionId.values()) criterionCount += list.length;

  return {
    model: next,
    matchedQuestions: criteriaByQuestionId.size,
    criterionCount,
  };
}

export type CriteriaMarkdownTeamResult = {
  team: TeamName;
  matchedQuestions: number;
  criterionCount: number;
};

/**
 * Apply criteria markdown across teams.
 * - With `# Strategy` / `# Events` / `# Design` sections → each section updates that team.
 * - Without team H1s → apply entire doc to `fallbackTeam` only (backward compatible).
 */
export function applyCriteriaMarkdownToModels(
  modelsByTeam: Partial<Record<TeamName, TeamGradingModel>>,
  markdown: string,
  fallbackTeam: TeamName,
  allowedTeams?: TeamName[],
): {
  models: Partial<Record<TeamName, TeamGradingModel>>;
  perTeam: CriteriaMarkdownTeamResult[];
  warnings: string[];
} {
  const allowed =
    allowedTeams && allowedTeams.length > 0
      ? new Set<TeamName>(allowedTeams)
      : null;

  const sections = splitCriteriaMarkdownByTeam(markdown);

  if (!sections) {
    const model = modelsByTeam[fallbackTeam];
    if (!model) {
      throw new Error(`No grading model for ${fallbackTeam} yet.`);
    }
    const result = applyCriteriaMarkdownToTeamModel(model, markdown);
    return {
      models: { ...modelsByTeam, [fallbackTeam]: result.model },
      perTeam: [
        {
          team: fallbackTeam,
          matchedQuestions: result.matchedQuestions,
          criterionCount: result.criterionCount,
        },
      ],
      warnings: [],
    };
  }

  const next: Partial<Record<TeamName, TeamGradingModel>> = { ...modelsByTeam };
  const perTeam: CriteriaMarkdownTeamResult[] = [];
  const errors: string[] = [];
  const skipped: string[] = [];

  for (const [team, section] of sections) {
    if (allowed && !allowed.has(team)) {
      skipped.push(team);
      continue;
    }
    const model = next[team];
    if (!model) {
      skipped.push(team);
      continue;
    }
    if (!section.trim()) {
      errors.push(`${team}: empty section under # ${team}.`);
      continue;
    }
    try {
      const result = applyCriteriaMarkdownToTeamModel(model, section);
      next[team] = result.model;
      perTeam.push({
        team,
        matchedQuestions: result.matchedQuestions,
        criterionCount: result.criterionCount,
      });
    } catch (e) {
      errors.push(
        `${team}: ${e instanceof Error ? e.message : 'Could not import criteria.'}`,
      );
    }
  }

  if (perTeam.length === 0) {
    const parts = [
      'No criteria matched any team in this markdown.',
      errors.length > 0 ? errors.slice(0, 3).join(' ') : null,
      skipped.length > 0
        ? `Sections for ${skipped.join(', ')} were skipped (team not in this import).`
        : null,
      'Use # Strategy / # Events / # Design headings, or omit team headings to apply to the active tab only.',
    ].filter(Boolean);
    throw new Error(parts.join(' '));
  }

  return {
    models: next,
    perTeam,
    warnings: [...errors, ...skipped.map((t) => `${t}: skipped (not in this import)`)],
  };
}

function formatCriteriaImportToast(perTeam: CriteriaMarkdownTeamResult[]): string {
  const totalQuestions = perTeam.reduce((s, t) => s + t.matchedQuestions, 0);
  const totalCriteria = perTeam.reduce((s, t) => s + t.criterionCount, 0);
  if (perTeam.length === 1) {
    const only = perTeam[0]!;
    return `Imported ${only.criterionCount} criteria across ${only.matchedQuestions} question(s) for ${only.team}.`;
  }
  const byTeam = perTeam
    .map((t) => `${t.team}: ${t.matchedQuestions} question(s)`)
    .join('; ');
  return `Imported ${totalCriteria} criteria across ${totalQuestions} question(s) (${byTeam}).`;
}

const CRITERIA_MARKDOWN_FORMAT_EXAMPLE = `# Strategy
## app-q1: Why UMA (max 200 words)
### Motivation & UMA Understanding (25%)
1. Anchor text for score 1
2. Anchor text for score 2
3. Anchor text for score 3
4. Anchor text for score 4
5. Anchor text for score 5

### Goal Clarity (25%)
1. ...
5. ...

# Events
## app-q1: Why UMA
### Motivation (25%)
1. ...
5. ...`;

function formatQuestionLinesForPrompt(model: TeamGradingModel): string {
  const app = getApplicationComponent(model);
  const questions = app?.questions ?? [];
  if (questions.length === 0) {
    return '(No questions on this team yet — go back and select score columns first.)';
  }
  return questions
    .map((q) => {
      const fields = [
        ...(q.csvField ? [q.csvField] : []),
        ...(q.csvFields ?? []),
      ];
      const fieldNote =
        fields.length > 0
          ? ` | csv: ${fields.map((f) => shortHeaderLabel(f, 60)).join(' · ')}`
          : '';
      return `- \`${q.id}\`: ${q.label}${fieldNote}`;
    })
    .join('\n');
}

/** Ready-made prompt for converting a scorecard into importable criteria markdown (all teams). */
export function buildCriteriaLlmPrompt(
  entries: Array<{ team: TeamName; model: TeamGradingModel }>,
): string {
  const withQuestions = entries.filter((e) => {
    const app = getApplicationComponent(e.model);
    return (app?.questions.length ?? 0) > 0;
  });
  const promptEntries = withQuestions.length > 0 ? withQuestions : entries;
  const teamNames = promptEntries.map((e) => e.team);
  const teamHeadingList = teamNames.map((t) => `# ${t}`).join(', ');

  const questionBlocks = promptEntries
    .map(({ team, model }) => {
      return `## ${team}\nQuestions (use these ids and labels in ## headings under # ${team}):\n${formatQuestionLinesForPrompt(model)}`;
    })
    .join('\n\n');

  return `You convert a recruitment rubric / scorecard into markdown for the UMA grading importer.

Teams included: ${teamNames.join(', ') || '(none)'}

${questionBlocks}

Output rules:
- Return only the markdown (no file). The user will paste it once into the recruitment app.
- Output ONLY markdown in the format below (no preamble). A single fenced markdown block is OK; prefer raw markdown with no fence.
- Produce one document covering all teams listed above. Start each team with an H1 heading exactly as ${teamHeadingList} (team name only; case may vary).
- Under each team H1, one ## heading per question. Prefer \`## {question_id}: {label}\` using the ids listed for that team. If you cannot use the id, put the full label after ## so it can be fuzzy-matched.
- Under each question, one ### heading per criterion. Put the weight ONLY once, as a trailing \`(30%)\` or \`(30)\` on the ### line — never inside the criterion name itself.
- Criterion names must be clean text only (e.g. \`### Motivation & UMA Understanding (30%)\`, not \`### Motivation & UMA Understanding (30%) (30%)\`). Do not bake weights into the title.
- If the source scorecard already has weights in criterion names (e.g. "Motivation (30%)"), move that weight to the ### suffix and leave the name without any \`(N%)\` / \`(N)\`. Never double the weight.
- Under each criterion, numbered anchors for scores 1–5 (\`1.\` … \`5.\`). You may use \`1)\` or \`- 1.\` as well. Fill up to 5 anchors; omit empty scores rather than inventing filler if the source has fewer.
- Preserve the meaning of the user's pasted scorecard; do not invent criteria that are not in the source.
- Do not include teams or questions that are not listed above.

Format example:
${CRITERIA_MARKDOWN_FORMAT_EXAMPLE}

Paste the user's scorecard below this line and convert it:

---
`;
}

function clearTeamCriteria(model: TeamGradingModel): TeamGradingModel {
  return {
    components: model.components.map((c) => {
      if (c.id !== 'application') return c;
      return {
        ...c,
        questions: c.questions.map((q) => ({ ...q, criteria: [] })),
      };
    }),
  };
}

/** Prefill Fall 2026 model and keep only questions tied to checked score columns. */
export function buildPrefillGradingModel(
  team: TeamName,
  scoreFields: string[],
  headers: string[],
): TeamGradingModel {
  const hydrated = hydrateFall2026ModelFromRound(
    team,
    headers,
    Array.from(scoreFields),
  );
  const app = getApplicationComponent(hydrated);
  if (!app) return structuredClone(getFall2026GradingModel(team));

  const scoreSet = new Set(scoreFields);
  const portfolioField = portfolioCsvField(hydrated);
  const keepPortfolio =
    teamUsesApplicationPortfolio(team) &&
    Boolean(portfolioField && headers.includes(portfolioField));

  const scoredQuestions = app.questions.filter((q) => {
    if (q.id === 'portfolio') return keepPortfolio;
    if (q.csvField && scoreSet.has(q.csvField)) return true;
    if (q.csvFields?.some((f) => scoreSet.has(f))) return true;
    return false;
  });

  // If Fall 2026 headers didn't match, map app-q* onto checked columns in order.
  let questions = scoredQuestions;
  if (questions.filter((q) => q.id !== 'portfolio').length === 0 && scoreFields.length > 0) {
    const base = structuredClone(getFall2026GradingModel(team));
    const baseApp = getApplicationComponent(base);
    const templateQs = (baseApp?.questions ?? []).filter((q) => q.id !== 'portfolio');
    questions = scoreFields.map((field, i) => {
      const template = templateQs[i] ?? templateQs[0];
      if (template) {
        return {
          ...structuredClone(template),
          id: templateQs[i] ? template.id : `app-q${i + 1}`,
          label: shortHeaderLabel(field, 80),
          csvField: field,
          csvFields: undefined,
        };
      }
      return {
        id: `app-q${i + 1}`,
        label: shortHeaderLabel(field, 80),
        weight: 1 / scoreFields.length,
        csvField: field,
        criteria: [newCriterion()],
      } satisfies RubricQuestion;
    });
    if (keepPortfolio && portfolioField) {
      const portfolioQ = (baseApp?.questions ?? []).find((q) => q.id === 'portfolio');
      if (portfolioQ) {
        questions = [
          ...questions,
          { ...structuredClone(portfolioQ), csvField: portfolioField },
        ];
      }
    }
  }

  return {
    components: hydrated.components.map((c) =>
      c.id === 'application' ? { ...c, questions } : c,
    ),
  };
}

/** Re-attach csvField values when Questions checkboxes change, preserving criteria edits. */
export function syncGradingModelCsvFields(
  existing: TeamGradingModel,
  team: TeamName,
  scoreFields: string[],
  headers: string[],
): TeamGradingModel {
  const fresh = buildPrefillGradingModel(team, scoreFields, headers);
  const existingApp = getApplicationComponent(existing);
  const freshApp = getApplicationComponent(fresh);
  if (!existingApp || !freshApp) return fresh;

  const byId = new Map(existingApp.questions.map((q) => [q.id, q]));
  const freshIds = new Set(freshApp.questions.map((q) => q.id));
  const questions = freshApp.questions.map((q) => {
    const prev = byId.get(q.id);
    if (!prev) return q;
    const wasLinked = Boolean(prev.linkedToQuestionId);
    const linkedTo =
      prev.linkedToQuestionId && freshIds.has(prev.linkedToQuestionId)
        ? prev.linkedToQuestionId
        : undefined;
    let criteria: RubricCriterion[];
    if (linkedTo) {
      criteria = [];
    } else if (wasLinked && prev.criteria.length === 0) {
      criteria = [newCriterion()];
    } else {
      criteria = structuredClone(prev.criteria);
    }
    return {
      ...q,
      label: prev.label || q.label,
      weight: prev.weight,
      criteria,
      linkedToQuestionId: linkedTo,
    };
  });

  return {
    components: fresh.components.map((c) =>
      c.id === 'application' ? { ...c, questions } : c,
    ),
  };
}

function cloneCriteriaWithNewIds(criteria: RubricCriterion[]): RubricCriterion[] {
  return criteria.map((c) => ({
    ...structuredClone(c),
    id: newCriterionId(),
  }));
}

/** Link `questionId` into `targetId` (primary). Folds weight into the primary. */
export function linkQuestionToPrimary(
  model: TeamGradingModel,
  questionId: string,
  targetId: string,
): TeamGradingModel {
  const app = getApplicationComponent(model);
  if (!app) return model;
  if (questionId === targetId) return model;

  const target = app.questions.find((q) => q.id === targetId);
  const source = app.questions.find((q) => q.id === questionId);
  if (!target || !source) return model;
  if (target.linkedToQuestionId) return model; // target must be primary
  // Don't link a question that already has others scoring with it.
  if (questionsLinkedTo(app.questions, questionId).length > 0) return model;

  return {
    components: model.components.map((c) => {
      if (c.id !== 'application') return c;
      return {
        ...c,
        questions: c.questions.map((q) => {
          if (q.id === targetId) {
            return { ...q, weight: q.weight + source.weight };
          }
          if (q.id === questionId) {
            return {
              ...q,
              linkedToQuestionId: targetId,
              weight: 0,
              criteria: [],
            };
          }
          return q;
        }),
      };
    }),
  };
}

/** Restore independent criteria on a linked question (clone primary’s list). */
export function unlinkQuestionFromPrimary(
  model: TeamGradingModel,
  questionId: string,
): TeamGradingModel {
  const app = getApplicationComponent(model);
  if (!app) return model;
  const source = app.questions.find((q) => q.id === questionId);
  if (!source?.linkedToQuestionId) return model;
  const primary = app.questions.find((q) => q.id === source.linkedToQuestionId);
  if (!primary) {
    return {
      components: model.components.map((c) => {
        if (c.id !== 'application') return c;
        return {
          ...c,
          questions: c.questions.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  linkedToQuestionId: undefined,
                  criteria: q.criteria.length > 0 ? q.criteria : [newCriterion()],
                  weight: q.weight > 0 ? q.weight : 1,
                }
              : q,
          ),
        };
      }),
    };
  }

  const linkedGroup = questionsLinkedTo(app.questions, primary.id);
  // Equal split of the combined primary weight across primary + currently linked.
  const parts = 1 + linkedGroup.length;
  const share = primary.weight / parts;
  const restoredCriteria =
    primary.criteria.length > 0
      ? cloneCriteriaWithNewIds(primary.criteria)
      : [newCriterion()];

  return {
    components: model.components.map((c) => {
      if (c.id !== 'application') return c;
      return {
        ...c,
        questions: c.questions.map((q) => {
          if (q.id === primary.id) {
            return { ...q, weight: primary.weight - share };
          }
          if (q.id === questionId) {
            return {
              ...q,
              linkedToQuestionId: undefined,
              weight: share,
              criteria: restoredCriteria,
            };
          }
          return q;
        }),
      };
    }),
  };
}

function criterionWeightWarning(criteria: RubricCriterion[]): string | null {
  const withWeights = criteria.filter((c) => c.weightPct != null);
  if (withWeights.length === 0) return null;
  if (withWeights.length < criteria.length) {
    return 'Some criteria have weights and some do not — equal split applies only when all omit weight.';
  }
  const sum = withWeights.reduce((s, c) => s + (c.weightPct ?? 0), 0);
  if (Math.abs(sum - 100) > 1) {
    return `Criterion weights sum to ${Math.round(sum)}% (expected ~100%).`;
  }
  return null;
}

export function validateGradingModels(
  teams: TeamName[],
  models: Partial<Record<TeamName, TeamGradingModel>>,
): string | null {
  for (const team of teams) {
    const model = models[team];
    const app = model ? getApplicationComponent(model) : undefined;
    if (!app || app.questions.length === 0) {
      return `${team} needs at least one question with criteria.`;
    }
    const byId = new Map(app.questions.map((q) => [q.id, q]));
    const primaries = app.questions.filter((q) => isPrimaryQuestion(q));
    if (primaries.length === 0) {
      return `${team} needs at least one question with its own criteria.`;
    }
    for (const q of app.questions) {
      if (q.linkedToQuestionId) {
        const target = byId.get(q.linkedToQuestionId);
        if (!target) {
          return `${team}: “${q.label}” is grouped with a missing question.`;
        }
        if (target.linkedToQuestionId) {
          return `${team}: “${q.label}” can’t score with “${target.label}” because that question is itself grouped.`;
        }
        if (q.linkedToQuestionId === q.id) {
          return `${team}: “${q.label}” can’t be grouped with itself.`;
        }
        continue; // linked questions don’t need local criteria
      }
      if (q.criteria.length === 0) {
        return `${team}: “${q.label}” needs at least one criterion.`;
      }
      for (const c of q.criteria) {
        if (!c.name.trim()) {
          return `${team}: every criterion needs a name.`;
        }
      }
    }
  }
  return null;
}

interface ImportCriteriaStepProps {
  teams: TeamName[];
  headers: string[];
  scoreFieldsByTeam: Record<TeamName, Set<string>>;
  gradingModelByTeam: Partial<Record<TeamName, TeamGradingModel>>;
  onChange: (next: Partial<Record<TeamName, TeamGradingModel>>) => void;
}

export default function ImportCriteriaStep({
  teams,
  headers,
  scoreFieldsByTeam,
  gradingModelByTeam,
  onChange,
}: ImportCriteriaStepProps) {
  const [activeTeam, setActiveTeam] = useState<TeamName>(teams[0] ?? 'Strategy');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteMarkdown, setPasteMarkdown] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (teams.length === 0) return;
    if (!teams.includes(activeTeam)) {
      setActiveTeam(teams[0]!);
    }
  }, [teams, activeTeam]);

  // Prefill / sync csvFields when entering or when score fields change.
  const scoreFieldsKey = useMemo(
    () =>
      teams
        .map((team) => `${team}:${[...(scoreFieldsByTeam[team] ?? [])].sort().join('|')}`)
        .join(';'),
    [teams, scoreFieldsByTeam],
  );

  useEffect(() => {
    if (teams.length === 0) return;
    let changed = false;
    const next: Partial<Record<TeamName, TeamGradingModel>> = { ...gradingModelByTeam };
    for (const team of teams) {
      const scoreFields = Array.from(scoreFieldsByTeam[team] ?? []);
      const existing = next[team];
      if (!existing) {
        next[team] = buildPrefillGradingModel(team, scoreFields, headers);
        changed = true;
      } else {
        const synced = syncGradingModelCsvFields(existing, team, scoreFields, headers);
        const prevApp = getApplicationComponent(existing);
        const nextApp = getApplicationComponent(synced);
        const prevKey = (prevApp?.questions ?? [])
          .map((q) => `${q.id}|${q.csvField ?? ''}|${(q.csvFields ?? []).join(',')}`)
          .join(';');
        const nextKey = (nextApp?.questions ?? [])
          .map((q) => `${q.id}|${q.csvField ?? ''}|${(q.csvFields ?? []).join(',')}`)
          .join(';');
        if (prevKey !== nextKey) {
          next[team] = synced;
          changed = true;
        }
      }
    }
    if (changed) onChange(next);
    // Sync when teams / headers / checked score columns change — not on every model edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, headers, scoreFieldsKey]);

  const weightWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const team of teams) {
      const app = getApplicationComponent(gradingModelByTeam[team] ?? { components: [] });
      if (!app) continue;
      for (const q of app.questions) {
        if (!isPrimaryQuestion(q)) continue;
        const w = criterionWeightWarning(q.criteria);
        if (w) warnings.push(`${team} · ${q.label}: ${w}`);
      }
    }
    return warnings;
  }, [teams, gradingModelByTeam]);

  const updateTeamModel = (team: TeamName, model: TeamGradingModel) => {
    onChange({ ...gradingModelByTeam, [team]: model });
  };

  const updateQuestion = (
    team: TeamName,
    questionId: string,
    updater: (q: RubricQuestion) => RubricQuestion,
  ) => {
    const model = gradingModelByTeam[team];
    if (!model) return;
    const next: TeamGradingModel = {
      components: model.components.map((c) => {
        if (c.id !== 'application') return c;
        return {
          ...c,
          questions: c.questions.map((q) => (q.id === questionId ? updater(q) : q)),
        };
      }),
    };
    updateTeamModel(team, next);
  };

  const setQuestionLink = (team: TeamName, questionId: string, targetId: string | null) => {
    const model = gradingModelByTeam[team];
    if (!model) return;
    if (!targetId) {
      updateTeamModel(team, unlinkQuestionFromPrimary(model, questionId));
      return;
    }
    // Switch target: unlink first (restores criteria/weight), then link to new primary.
    const app = getApplicationComponent(model);
    const current = app?.questions.find((q) => q.id === questionId);
    let base = model;
    if (current?.linkedToQuestionId) {
      base = unlinkQuestionFromPrimary(base, questionId);
    }
    updateTeamModel(team, linkQuestionToPrimary(base, questionId, targetId));
  };

  const handleClearAll = () => {
    const model = gradingModelByTeam[activeTeam];
    if (!model) return;
    updateTeamModel(activeTeam, clearTeamCriteria(model));
    toast.success(`Cleared all criteria for ${activeTeam}.`);
  };

  const handleCopyLlmPrompt = async () => {
    const entries = teams
      .map((team) => {
        const model = gradingModelByTeam[team];
        return model ? { team, model } : null;
      })
      .filter((e): e is { team: TeamName; model: TeamGradingModel } => e != null);
    if (entries.length === 0) {
      toast.error('No grading models to include in the prompt yet.');
      return;
    }
    const withQuestions = entries.filter((e) => {
      const app = getApplicationComponent(e.model);
      return (app?.questions.length ?? 0) > 0;
    });
    const promptEntries = withQuestions.length > 0 ? withQuestions : entries;
    try {
      await navigator.clipboard.writeText(buildCriteriaLlmPrompt(promptEntries));
      const names = promptEntries.map((e) => e.team).join(', ');
      toast.success(
        `LLM prompt copied for ${names}. Paste the reply once via Import → Paste markdown.`,
      );
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const applyImportedMarkdown = (markdown: string) => {
    const result = applyCriteriaMarkdownToModels(
      gradingModelByTeam,
      markdown,
      activeTeam,
      teams,
    );
    onChange(result.models);
    toast.success(formatCriteriaImportToast(result.perTeam));
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.slice(0, 3).join(' '));
    }
    return true;
  };

  const handleApplyPastedMarkdown = () => {
    if (!pasteMarkdown.trim()) {
      toast.error('Paste the markdown the LLM returned first.');
      return;
    }
    setImporting(true);
    try {
      if (applyImportedMarkdown(pasteMarkdown)) {
        setPasteDialogOpen(false);
        setPasteMarkdown('');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not import criteria.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    const model = gradingModelByTeam[activeTeam];
    if (!model) {
      toast.error('No grading model for this team yet.');
      return;
    }
    setImporting(true);
    try {
      const lower = file.name.toLowerCase();
      const isCsv =
        lower.endsWith('.csv') ||
        lower.endsWith('.xlsx') ||
        lower.endsWith('.xls') ||
        lower.endsWith('.ods');

      if (isCsv) {
        const parsed = await parseSpreadsheetFile(file);
        const result = applyCriteriaCsvToTeamModel(model, parsed);
        updateTeamModel(activeTeam, result.model);
        toast.success(
          `Imported ${result.criterionCount} criteria across ${result.matchedQuestions} question(s) for ${activeTeam}.`,
        );
      } else {
        const text = await file.text();
        applyImportedMarkdown(text);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not import criteria.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No teams with applications to configure.</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Edit grading criteria</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Starts from the Fall 2026 scorecard for each team. Adjust criterion names, weights, and
            1–5 anchors to match what graders should see. Optionally score two or more questions
            together with one shared criteria list.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Prefer markdown import: <span className="font-medium text-foreground">Copy LLM prompt</span>{' '}
            once (includes every team with questions), paste your scorecard into a chat, then{' '}
            <span className="font-medium text-foreground">Paste markdown</span> or upload a{' '}
            <span className="font-mono text-[11px]">.md</span> file once. Format:{' '}
            <span className="font-mono text-[11px]"># Strategy</span> /{' '}
            <span className="font-mono text-[11px]"># Events</span> /{' '}
            <span className="font-mono text-[11px]"># Design</span>, then{' '}
            <span className="font-mono text-[11px]">## question_id: label</span>, then{' '}
            <span className="font-mono text-[11px]">### Criterion (25%)</span> with numbered{' '}
            <span className="font-mono text-[11px]">1.</span>–
            <span className="font-mono text-[11px]">5.</span> anchors. With team headings, one paste
            updates all matching teams; without them, import applies to the active tab only. Matched
            questions are replaced; others stay unchanged.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={CRITERIA_MARKDOWN_ACCEPT}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              void handleImportFile(e.target.files?.[0] ?? null);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 normal-case"
                  disabled={
                    importing ||
                    !teams.some((team) => gradingModelByTeam[team] != null)
                  }
                />
              }
            >
              {importing ? 'Importing…' : 'Import'}
              <ChevronDown className="size-3.5 opacity-70" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              <DropdownMenuItem
                className="normal-case"
                onClick={() => {
                  void handleCopyLlmPrompt();
                }}
              >
                <ClipboardCopy className="size-3.5" aria-hidden />
                Copy LLM prompt
              </DropdownMenuItem>
              <DropdownMenuItem
                className="normal-case"
                onClick={() => setPasteDialogOpen(true)}
              >
                <ClipboardPaste className="size-3.5" aria-hidden />
                Paste markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                className="normal-case"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden />
                Upload markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog
            open={pasteDialogOpen}
            onOpenChange={(open) => {
              setPasteDialogOpen(open);
              if (!open) setPasteMarkdown('');
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Paste markdown</DialogTitle>
                <DialogDescription>
                  Paste the full markdown the LLM returned (all teams). With{' '}
                  <span className="font-mono text-xs"># Strategy</span> etc. headings, every
                  matching team updates; without team headings, only the active tab (
                  {activeTeam}) is updated.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="criteria-paste-markdown">Markdown</Label>
                <textarea
                  id="criteria-paste-markdown"
                  value={pasteMarkdown}
                  onChange={(e) => setPasteMarkdown(e.target.value)}
                  placeholder={
                    '# Strategy\n## app-q1: Why UMA\n### Motivation (25%)\n1. …\n5. …\n\n# Events\n## app-q1: …'
                  }
                  rows={12}
                  className="flex min-h-[12rem] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={importing}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasteDialogOpen(false)}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyPastedMarkdown}
                  disabled={importing || !pasteMarkdown.trim()}
                >
                  {importing ? 'Applying…' : 'Apply'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DestructiveConfirmDialog
            open={clearConfirmOpen}
            onOpenChange={setClearConfirmOpen}
            title={`Clear all criteria for ${activeTeam}?`}
            description={
              <>
                Removes every criterion from every question on the{' '}
                <strong>{activeTeam}</strong> tab. Questions stay; you can re-add criteria or
                import markdown afterward. Other teams are not changed.
              </>
            }
            confirmLabel="Clear all"
            onConfirm={handleClearAll}
            trigger={
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="normal-case"
                disabled={!gradingModelByTeam[activeTeam]}
              />
            }
            triggerLabel="Clear all"
          />
        </div>
      </div>

      <Tabs
        value={activeTeam}
        onValueChange={(v) => {
          if (teams.includes(v as TeamName)) setActiveTeam(v as TeamName);
        }}
      >
        <TabsList variant="line" className="h-auto w-full max-w-xl justify-start">
          {teams.map((team) => (
            <TabsTrigger key={team} value={team}>
              {team}
            </TabsTrigger>
          ))}
        </TabsList>

        {teams.map((team) => {
          const model = gradingModelByTeam[team];
          const app = model ? getApplicationComponent(model) : undefined;
          const questions = app?.questions ?? [];

          return (
            <TabsContent key={team} value={team} className="space-y-6 pt-4">
              {questions.length === 0 ? (
                <p className="text-sm text-amber-800">
                  No scored questions for {team}. Go back and check at least one question.
                </p>
              ) : (
                questions.map((question) => {
                  const weightWarn = criterionWeightWarning(question.criteria);
                  const responseCols = [
                    ...(question.csvField ? [question.csvField] : []),
                    ...(question.csvFields ?? []),
                  ];
                  const linkedHere = questionsLinkedTo(questions, question.id);
                  const isLinked = Boolean(question.linkedToQuestionId);
                  const linkTarget = isLinked
                    ? questions.find((q) => q.id === question.linkedToQuestionId)
                    : undefined;
                  const hasDependents = linkedHere.length > 0;
                  // Targets: other primaries only (not self, not already-linked questions).
                  const scoreWithOptions = questions.filter(
                    (q) => q.id !== question.id && isPrimaryQuestion(q),
                  );
                  // Base UI Select shows the raw `value` in the trigger unless `items`
                  // maps each value → label (SelectItem children alone are not enough).
                  const scoreWithItems = [
                    { value: SCORE_ALONE_VALUE, label: 'This question only' },
                    ...scoreWithOptions.map((opt) => ({
                      value: opt.id,
                      label: opt.label,
                    })),
                  ];

                  return (
                    <div
                      key={question.id}
                      className="space-y-4 rounded-xl border border-border/70 bg-background p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">{question.label}</p>
                          {responseCols.length > 0 ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              CSV:{' '}
                              {responseCols.map((h) => shortHeaderLabel(h, 60)).join(' · ')}
                            </p>
                          ) : null}
                          {linkedHere.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="text-xs text-muted-foreground">Also showing:</span>
                              {linkedHere.map((lq) => (
                                <span
                                  key={lq.id}
                                  className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-xs text-foreground"
                                >
                                  {lq.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="w-full shrink-0 space-y-1.5 sm:w-64">
                          <Label htmlFor={`${team}-${question.id}-score-with`}>
                            Score together with
                          </Label>
                          <Select
                            value={question.linkedToQuestionId ?? SCORE_ALONE_VALUE}
                            items={scoreWithItems}
                            onValueChange={(value) => {
                              if (value == null) return;
                              if (value === SCORE_ALONE_VALUE) {
                                setQuestionLink(team, question.id, null);
                              } else {
                                setQuestionLink(team, question.id, value);
                              }
                            }}
                            disabled={hasDependents}
                          >
                            <SelectTrigger
                              id={`${team}-${question.id}-score-with`}
                              className="w-full bg-background"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {scoreWithItems.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {hasDependents ? (
                            <p className="text-[11px] text-muted-foreground">
                              Ungroup the questions listed above first if you want to score this one
                              with something else.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {isLinked ? (
                        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                          Graders will see this response with{' '}
                          <span className="font-medium text-foreground">
                            {linkTarget?.label ?? 'the other question'}
                          </span>
                          . Shared criteria are edited there.
                        </div>
                      ) : (
                        <>
                          {weightWarn ? (
                            <p className="text-xs text-amber-800">{weightWarn}</p>
                          ) : null}

                          <div className="space-y-4">
                            {question.criteria.map((criterion, cIdx) => (
                              <div
                                key={criterion.id}
                                className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:p-4"
                              >
                                <div className="flex flex-wrap items-end gap-3">
                                  <div className="min-w-[12rem] flex-1 space-y-1.5">
                                    <Label htmlFor={`${team}-${criterion.id}-name`}>
                                      Criterion name
                                    </Label>
                                    <Input
                                      id={`${team}-${criterion.id}-name`}
                                      value={criterion.name}
                                      placeholder="Criterion name"
                                      className="placeholder:text-muted-foreground/55"
                                      onChange={(e) =>
                                        updateQuestion(team, question.id, (q) => ({
                                          ...q,
                                          criteria: q.criteria.map((c) =>
                                            c.id === criterion.id
                                              ? { ...c, name: e.target.value }
                                              : c,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="w-28 space-y-1.5">
                                    <Label htmlFor={`${team}-${criterion.id}-weight`}>
                                      Weight %
                                    </Label>
                                    <Input
                                      id={`${team}-${criterion.id}-weight`}
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={1}
                                      placeholder="Equal"
                                      value={criterion.weightPct ?? ''}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const weightPct =
                                          raw === ''
                                            ? undefined
                                            : Number.parseFloat(raw);
                                        updateQuestion(team, question.id, (q) => ({
                                          ...q,
                                          criteria: q.criteria.map((c) =>
                                            c.id === criterion.id
                                              ? {
                                                  ...c,
                                                  weightPct:
                                                    weightPct != null && Number.isFinite(weightPct)
                                                      ? weightPct
                                                      : undefined,
                                                }
                                              : c,
                                          ),
                                        }));
                                      }}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground"
                                    disabled={question.criteria.length <= 1}
                                    onClick={() =>
                                      updateQuestion(team, question.id, (q) => ({
                                        ...q,
                                        criteria: q.criteria.filter((c) => c.id !== criterion.id),
                                      }))
                                    }
                                    aria-label={`Remove criterion ${criterion.name || cIdx + 1}`}
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                    Remove
                                  </Button>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Scoring guide (1–5)
                                  </p>
                                  <div className="grid gap-2">
                                    {criterion.anchors.map((anchor) => (
                                      <div key={anchor.score} className="flex items-start gap-2">
                                        <span
                                          className={cn(
                                            'mt-1.5 w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground',
                                          )}
                                        >
                                          {anchor.score}
                                        </span>
                                        <Input
                                          value={anchor.description}
                                          placeholder={`Description for score ${anchor.score}`}
                                          className="placeholder:text-muted-foreground/55"
                                          onChange={(e) =>
                                            updateQuestion(team, question.id, (q) => ({
                                              ...q,
                                              criteria: q.criteria.map((c) =>
                                                c.id === criterion.id
                                                  ? {
                                                      ...c,
                                                      anchors: c.anchors.map((a) =>
                                                        a.score === anchor.score
                                                          ? {
                                                              ...a,
                                                              description: e.target.value,
                                                            }
                                                          : a,
                                                      ),
                                                    }
                                                  : c,
                                              ),
                                            }))
                                          }
                                          onPaste={
                                            anchor.score === 1
                                              ? (e) => {
                                                  const nextAnchors = applyMultilineAnchorPaste(
                                                    criterion.anchors,
                                                    e.clipboardData.getData('text'),
                                                  );
                                                  if (!nextAnchors) return;
                                                  e.preventDefault();
                                                  updateQuestion(team, question.id, (q) => ({
                                                    ...q,
                                                    criteria: q.criteria.map((c) =>
                                                      c.id === criterion.id
                                                        ? { ...c, anchors: nextAnchors }
                                                        : c,
                                                    ),
                                                  }));
                                                }
                                              : undefined
                                          }
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              updateQuestion(team, question.id, (q) => ({
                                ...q,
                                criteria: [...q.criteria, newCriterion()],
                              }))
                            }
                          >
                            <Plus className="size-3.5" aria-hidden />
                            Add criterion
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {weightWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Weight notes (won&apos;t block Continue)</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {weightWarnings.slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
