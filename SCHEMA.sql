-- UMA Recruitment Platform — Schema v2
-- Replaces v1.0's single-config/single-round tables (config, applications, graders, assignments, scores).
-- Design notes are in SPEC.md — read that first.

-- ── Teams (fixed, seeded once) ──────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (name IN ('Strategy', 'Events', 'Design'))
);

-- ── Rounds (a recruitment cycle, scoped per team) ───────────
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  label TEXT NOT NULL,                -- e.g. "Fall 2026"
  status TEXT NOT NULL DEFAULT 'setup'
    CHECK (status IN ('setup', 'pre_application', 'application', 'first_round', 'final_round', 'deliberations', 'closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_rounds_team_status ON rounds(team_id, status);

-- ── Users (every human with any access) ─────────────────────
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'exec', 'ad_hoc_exec', 'general_member')),
  invited_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Exec + ad hoc exec access grants — tracked, no untracked access.
-- Admins implicitly have all-team access and don't need rows here.
CREATE TABLE IF NOT EXISTS access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  round_id INTEGER REFERENCES rounds(id),      -- NULL = standing access (exec); set = one-off (ad hoc exec)
  stage TEXT,                                  -- NULL = all stages; set = scoped to one stage (ad hoc exec)
  is_director INTEGER NOT NULL DEFAULT 0 CHECK (is_director IN (0, 1)),
  granted_by INTEGER NOT NULL REFERENCES users(id),
  granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_access_grants_user ON access_grants(user_id);

-- ── Candidates (a person; can apply to multiple teams) ──────
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Applications: Candidate × Team × Round — the siloed unit ─
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  fields TEXT NOT NULL,                        -- JSON blob of raw CSV fields, same pattern as v1.0
  stage TEXT NOT NULL DEFAULT 'application'
    CHECK (stage IN ('application', 'first_round', 'final_round', 'deliberations', 'advanced', 'rejected')),
  -- When stage = 'rejected', which pipeline gate they were cut at (NULL if unknown / not rejected).
  rejected_from_stage TEXT
    CHECK (
      rejected_from_stage IS NULL
      OR rejected_from_stage IN ('application', 'first_round', 'final_round', 'deliberations')
    ),
  admin_note TEXT,
  final_score REAL,
  rank INTEGER,
  row_index INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (candidate_id, round_id, team_id)
);
CREATE INDEX IF NOT EXISTS idx_applications_round_team ON applications(round_id, team_id);
CREATE INDEX IF NOT EXISTS idx_applications_team_round_stage ON applications(team_id, round_id, stage);

-- Per-round CSV/scoring config (replaces v1 config table, scoped per team round)
CREATE TABLE IF NOT EXISTS round_settings (
  round_id INTEGER PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  csv_headers TEXT NOT NULL DEFAULT '[]',
  score_fields TEXT NOT NULL DEFAULT '[]',
  custom_score_fields TEXT NOT NULL DEFAULT '[]',
  grader_instructions TEXT,
  interview_script_first_round TEXT,
  interview_guides TEXT,
  normalization_factors TEXT,
  context_fields TEXT NOT NULL DEFAULT '[]',
  portfolio_fields TEXT NOT NULL DEFAULT '[]',
  graders_per_application INTEGER NOT NULL DEFAULT 3 CHECK (graders_per_application >= 1),
  grading_model TEXT,
  coffee_chat_start_date TEXT,
  application_due_date TEXT
);

-- Org-wide defaults (group size, etc.). Per-team dates/times live in team_interview_schedule_config.
CREATE TABLE IF NOT EXISTS interview_schedule_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  first_round_date TEXT,
  first_round_start_time TEXT NOT NULL DEFAULT '09:00',
  final_round_date TEXT,
  final_round_start_time TEXT NOT NULL DEFAULT '09:00',
  block_minutes INTEGER NOT NULL DEFAULT 30 CHECK (block_minutes >= 15),
  group_size INTEGER NOT NULL DEFAULT 4 CHECK (group_size >= 2),
  parallel_groups_per_block INTEGER NOT NULL DEFAULT 2 CHECK (parallel_groups_per_block >= 1)
);

CREATE TABLE IF NOT EXISTS team_interview_schedule_config (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  first_round_date TEXT,
  first_round_start_time TEXT NOT NULL DEFAULT '09:00',
  final_round_date TEXT,
  final_round_start_time TEXT NOT NULL DEFAULT '09:00',
  block_minutes INTEGER NOT NULL DEFAULT 30 CHECK (block_minutes >= 15)
);

-- Admin-controlled gates: graders/interviewers can only work when a stage is unlocked.
CREATE TABLE IF NOT EXISTS round_stage_unlocks (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('application', 'first_round', 'final_round', 'deliberations')),
  unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  unlocked_by INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (round_id, stage)
);

-- Coffee chat notes logged during pre-application (free-text applicant name until CSV import).
CREATE TABLE IF NOT EXISTS coffee_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
  chat_date TEXT NOT NULL,
  submitter_id INTEGER NOT NULL REFERENCES users(id),
  submitter_name TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_name_normalized TEXT NOT NULL,
  applicant_email TEXT,
  applicant_grade_level TEXT,
  teams_interested TEXT NOT NULL DEFAULT '[]',
  vibes TEXT,
  green_flags TEXT,
  red_flags TEXT,
  other_comments TEXT,
  conflict_of_interest TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_coffee_chats_round ON coffee_chats(round_id);
CREATE INDEX IF NOT EXISTS idx_coffee_chats_submitter ON coffee_chats(submitter_id);
CREATE INDEX IF NOT EXISTS idx_coffee_chats_applicant_norm ON coffee_chats(round_id, applicant_name_normalized);

-- ── Team advancement proposals (exec → admin) ─────────────────
CREATE TABLE IF NOT EXISTS team_advancement_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  from_stage TEXT NOT NULL DEFAULT 'application'
    CHECK (from_stage IN ('application', 'first_round')),
  top_n INTEGER NOT NULL,
  application_ids TEXT NOT NULL,
  candidates TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'withdrawn')),
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_advancement_submissions_team_round
  ON team_advancement_submissions(team_id, round_id, status);

-- Admin-only color ratings during advancement (not tied to grader assignments).
CREATE TABLE IF NOT EXISTS admin_advancement_verdicts (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL CHECK (from_stage IN ('application', 'first_round')),
  admin_user_id INTEGER NOT NULL REFERENCES users(id),
  verdict TEXT CHECK (verdict IN ('green', 'high_yellow', 'yellow', 'low_yellow', 'red')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (team_id, round_id, application_id, from_stage, admin_user_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_advancement_verdicts_team_round
  ON admin_advancement_verdicts(team_id, round_id, from_stage);

-- ── Pre-Application interactions (info sessions, coffee chats) ─
CREATE TABLE IF NOT EXISTS pre_application_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  logged_by INTEGER NOT NULL REFERENCES users(id),
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Graders / interviewers assigned to an application at a given stage ─
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  stage TEXT NOT NULL CHECK (stage IN ('application', 'first_round', 'final_round')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_at INTEGER,
  comment TEXT,
  advancement_recommendation TEXT CHECK (advancement_recommendation IN ('advance', 'pass')),
  advancement_verdict TEXT CHECK (advancement_verdict IN ('green', 'high_yellow', 'yellow', 'low_yellow', 'red')),
  UNIQUE (application_id, user_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_application ON assignments(application_id);
CREATE INDEX IF NOT EXISTS idx_assignments_application_stage ON assignments(application_id, stage);

-- ── Scores ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  score INTEGER CHECK (score IS NULL OR (score BETWEEN 1 AND 10)),
  note TEXT,
  UNIQUE (assignment_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_scores_assignment ON scores(assignment_id);

-- ── Red/green flags — always-on overlay from Final Round + Social onward ─
CREATE TABLE IF NOT EXISTS flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  color TEXT NOT NULL CHECK (color IN ('red', 'green')),
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_flags_application ON flags(application_id);

-- ── Deliberations sessions (attendance mechanism: TBD, placeholder below) ─
CREATE TABLE IF NOT EXISTS deliberation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  facilitator_id INTEGER NOT NULL REFERENCES users(id),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER
);

-- Persisted kanban layout for deliberations (column membership, order, rejected flags).
-- Shared across admin sessions for a team+round. Distinct from canvas_cards (ephemeral).
CREATE TABLE IF NOT EXISTS deliberation_boards (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id),
  PRIMARY KEY (team_id, round_id)
);

-- Per-user deliberations scratch board (team exec personal workspace).
-- Distinct from deliberation_boards (admin official board) and canvas_cards (session-scoped).
CREATE TABLE IF NOT EXISTS deliberation_personal_boards (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (team_id, round_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_deliberation_personal_boards_user
  ON deliberation_personal_boards(user_id);

-- Canvas card positions are session-scoped and discarded when the session ends.
-- Table is intentionally ephemeral — consider an in-memory store (e.g. Redis) instead of SQL
-- if session churn is high; SQL version included here for consistency with the rest of the schema.
CREATE TABLE IF NOT EXISTS canvas_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES deliberation_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),   -- whose personal canvas this card belongs to
  application_id INTEGER NOT NULL REFERENCES applications(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_canvas_cards_session_user ON canvas_cards(session_id, user_id);

-- Follow mode: tracks which users are currently following which facilitator's view.
CREATE TABLE IF NOT EXISTS follow_state (
  session_id INTEGER NOT NULL REFERENCES deliberation_sessions(id) ON DELETE CASCADE,
  follower_id INTEGER NOT NULL REFERENCES users(id),
  following_user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (session_id, follower_id)
);

-- Org-wide application rubric defaults (shared across Strategy / Events / Design).
CREATE TABLE IF NOT EXISTS org_rubric (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  score_fields TEXT NOT NULL DEFAULT '[]',
  custom_score_fields TEXT NOT NULL DEFAULT '[]',
  grader_instructions TEXT
);

-- Org-wide coffee chat window (set before application import; copied onto round_settings when rounds exist).
CREATE TABLE IF NOT EXISTS org_coffee_chat_dates (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  coffee_chat_start_date TEXT,
  application_due_date TEXT
);

-- Org-wide recruitment cycle label (semester + year; synced to active round labels).
CREATE TABLE IF NOT EXISTS org_recruitment_cycle (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  semester TEXT NOT NULL CHECK (semester IN ('fall', 'spring')),
  year INTEGER NOT NULL CHECK (year >= 2026)
);

-- Per-team max applicants to advance from each stage (set by admin each cycle).
-- application_cap: Application → First Round
-- first_round_cap: First Round → Final Round
-- deliberations_cap: Deliberations → Final selection (offers)
-- *_over_cap_extra: how many past the official cap directors may take after entering the org go-over code.
-- *_allow_over_cap: legacy boolean columns (unused by app logic; kept for DB compatibility).
-- Note: Final Round → Deliberations has no cap — all final-round candidates enter delibs.
CREATE TABLE IF NOT EXISTS team_advancement_caps (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  application_cap INTEGER CHECK (application_cap IS NULL OR application_cap >= 1),
  first_round_cap INTEGER CHECK (first_round_cap IS NULL OR first_round_cap >= 1),
  deliberations_cap INTEGER CHECK (deliberations_cap IS NULL OR deliberations_cap >= 1),
  application_allow_over_cap INTEGER NOT NULL DEFAULT 0
    CHECK (application_allow_over_cap IN (0, 1)),
  first_round_allow_over_cap INTEGER NOT NULL DEFAULT 0
    CHECK (first_round_allow_over_cap IN (0, 1)),
  deliberations_allow_over_cap INTEGER NOT NULL DEFAULT 0
    CHECK (deliberations_allow_over_cap IN (0, 1)),
  application_over_cap_extra INTEGER NOT NULL DEFAULT 0
    CHECK (application_over_cap_extra >= 0),
  first_round_over_cap_extra INTEGER NOT NULL DEFAULT 0
    CHECK (first_round_over_cap_extra >= 0),
  deliberations_over_cap_extra INTEGER NOT NULL DEFAULT 0
    CHECK (deliberations_over_cap_extra >= 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id)
);

-- Org-wide secret for directors to raise a team's over-cap extra.
-- Hash is used for verify; plain is admin-readable so the code can be revealed later.
CREATE TABLE IF NOT EXISTS org_over_cap_code (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code_hash TEXT NOT NULL,
  code_plain TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id)
);

-- Interview schedule slots (admin-built grid; manual interviewer assignment).
CREATE TABLE IF NOT EXISTS interview_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('first_round', 'final_round')),
  scheduled_at TEXT NOT NULL,
  location TEXT,
  logistics_note TEXT,
  group_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (application_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_interview_slots_round_team ON interview_slots(round_id, team_id, stage);

CREATE TABLE IF NOT EXISTS interview_slot_interviewers (
  slot_id INTEGER NOT NULL REFERENCES interview_slots(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (slot_id, user_id)
);

-- Email templates + sent markers per outcome email moment (admin only).
-- from_stage: application → First Round | first_round → Final Round | final_round → offer.
CREATE TABLE IF NOT EXISTS round_outcome_emails (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  from_stage TEXT NOT NULL
    CHECK (from_stage IN ('application', 'first_round', 'final_round')),
  pass_subject TEXT,
  pass_body TEXT,
  reject_subject TEXT,
  reject_body TEXT,
  pass_notified_at INTEGER,
  reject_notified_at INTEGER,
  PRIMARY KEY (round_id, from_stage)
);

-- Legacy single-stage table (migrated into round_outcome_emails on boot).
CREATE TABLE IF NOT EXISTS round_communications (
  round_id INTEGER PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  pass_subject TEXT,
  pass_body TEXT,
  reject_subject TEXT,
  reject_body TEXT,
  pass_notified_at INTEGER,
  reject_notified_at INTEGER
);

-- Per-user in-app notifications (assignment / unlock events).
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  team_id INTEGER REFERENCES teams(id),
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
