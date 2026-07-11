# UMA Recruitment Platform — Build Spec (v2)

## Context

v1.0 (`RoBhagat1/recruitment`) proved the core scoring loop: CSV upload → assign graders → private grading links → admin finalizes with averaged scores and tie detection. It works, but it's a **single-round, single-team, two-role** tool. This spec describes what's actually needed: a **persistent, multi-team, five-stage** platform with visibility rules and a live Deliberations feature. Treat this as a rebuild of the data model and access layer, not a patch.

This doc describes information architecture and business logic. It does not prescribe UI. Items marked `TBD` are open — flag back before guessing.

---

## 1. What v1.0 got right (keep this)

- CSV import with column mapping (scored vs. context-only)
- Private, tokenized grader links (no login required)
- Assignment model: each item scored by exactly N graders, tracked via a join table
- Score averaging + tie detection at finalize time
- Admin dashboard with live grading progress

## 2. What's missing (this spec covers all of it)

| Gap | v1.0 | Needed |
|---|---|---|
| Teams | none — one config, one pool | Strategy / Events / Design fully siloed |
| Stages | one (`setup → active → finalized`) | 5 stages, each with its own data & rules |
| Roles | 2 (admin token, grader link) | 4 tiers (admin, team exec, ad hoc exec, general member) |
| Visibility | none | blind review at Application; interviewers blind until Deliberations |
| Persistence | wiped every round (`New Round` = `DROP TABLE`) | persistent across rounds; rounds are a dimension, not a reset |
| Deliberations | doesn't exist | live collaborative canvas + follow mode |
| Flags | doesn't exist | red/green flag overlay, always-on from Social Round |

---

## 3. Core entities

```
Team            — Strategy | Events | Design (fixed, seeded)
Round           — a recruitment cycle (e.g. "Fall 2026"), scoped per team
User            — every human with any access; role + team assignment live here
Candidate       — one person; can apply to multiple teams independently
Application     — Candidate × Team × Round; this is the siloed unit everything hangs off
Stage           — Pre-App | Application | First Round | Final Round + Social | Deliberations
Score           — Application × Stage × Grader × Field
Flag            — Candidate × Team × Round; red/green, author, timestamp, note
DeliberationBoard — Team × Round; holds canvas state
CanvasCard      — position/session-scoped; discarded when a Deliberations session ends
```

**Key rule preserved from the original spec:** a candidate applying to multiple teams is evaluated *entirely independently* per team — no shared score, no shared flag, no shared advancement decision. `Application` (not `Candidate`) is the unit every downstream table joins against.

## 4. Roles & access

| Role | Who | Scope |
|---|---|---|
| Admin | 2 Recruitment Directors, 2 Presidents | Everything, all teams, all stages |
| Team exec | Directors + PMs per team | Own team only, all stages |
| Ad hoc exec | Any other exec, invited per instance | Whatever an admin explicitly grants (team + stage), tracked |
| General member | Any club member | Red/green flags only, no application/interview access |

Every access grant is invite-based and logged — there is no untracked access, including for ad hoc exec.

## 5. Stage-by-stage rules

**Pre-Application** — info sessions & coffee chats logged (~1.5 weeks pre-deadline). Not scored; attendance/interaction notes only.

**Application** — CSV import per team/round. **Blind review**: candidate names hidden from graders; visible to admins only. Scoring rubric: `TBD` (finalize field list per team).

**First Round Interview** — interviewers are blind to Application content entirely at this stage — they only see what's needed to conduct the interview, not prior scores or notes.

**Final Round + Social** — red/green flags become active here (see §6). Interview scoring continues.

**Deliberations** — the only stage where everything merges: Application scores, interview scores, and flags all become visible together on a unified candidate profile, per team.

## 6. Red/green flags

- Overlay, not a stage-gated field — active continuously from Final Round + Social onward.
- Any general member can submit a flag on a candidate (their team's candidates only).
- Flags carry author, timestamp, color, optional note.
- Visible to team exec/admin at Deliberations as part of the unified profile.

## 7. Deliberations canvas

- Figma-style personal canvas per user: drag/arrange candidate cards for comparison.
- **Follow mode**: participants can sync their view to a facilitator's screen for live group discussion.
- Canvas arrangements are **session-scoped** — discarded when the session ends. Not persisted long-term.
- `TBD`: exact attendance-tracking mechanism for who was present in a Deliberations session.

## 8. Open items (flag before building, don't guess)

- Scoring rubric/criteria finalization — Application field list per team
- Deliberations attendance tracking mechanism
- Ad hoc exec access flow — exact grant/revoke UI
- Interviewer pool overlap rules (can one person interview for multiple teams in the same round?)

---

## 9. Suggested build order

1. Schema migration: teams, rounds, roles, applications-as-siloed-unit (see `SCHEMA.sql`)
2. Auth/role layer — replace v1.0's single admin-token + grader-token model with real role-scoped sessions
3. Application stage (CSV import → blind review → scoring), rebuilt per-team
4. First/Final Round interview flow, with blindness rules enforced at the query layer, not just the UI
5. Red/green flag overlay
6. Deliberations: unified profile view first, canvas + follow mode second (canvas is the highest-complexity, most deferrable piece)
7. Round persistence — replace "New Round = wipe DB" with "create new Round row, keep history"

Don't build Deliberations' live canvas before the rest of the pipeline works end-to-end for one team — it's the piece most likely to blow up scope if front-loaded.
