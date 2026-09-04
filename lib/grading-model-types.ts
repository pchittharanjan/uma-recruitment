/** Shared types for Fall 2026 weighted criterion scoring. */

export type ScoreAnchor = {
  score: number;
  description: string;
};

export type RubricCriterion = {
  id: string;
  name: string;
  /** Share of the parent question (0–100). Equal split when omitted. */
  weightPct?: number;
  anchors: ScoreAnchor[];
};

export type RubricQuestion = {
  id: string;
  label: string;
  /** Share of the parent component (0–1). */
  weight: number;
  /** Primary CSV column for the written response. */
  csvField?: string;
  /** Extra columns shown with the response (e.g. Events visual upload). */
  csvFields?: string[];
  criteria: RubricCriterion[];
  /**
   * When set, this question’s response is shown with the target (primary) question;
   * only the primary owns criteria and score keys. Linked weight is folded into the
   * primary (and zeroed here) when the admin enables grouping.
   */
  linkedToQuestionId?: string;
};

export type RubricComponent = {
  id: string;
  label: string;
  /** Share of final score (0–100). */
  weightPct: number;
  questions: RubricQuestion[];
};

export type TeamGradingModel = {
  components: RubricComponent[];
};

export type TeamGradingModels = Record<'Strategy' | 'Events' | 'Design', TeamGradingModel>;
