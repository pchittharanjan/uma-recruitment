---
name: admin-applications-spreadsheet
description: >-
  Builds the admin spreadsheet-style applications browser for the UMA Recruitment
  Platform — sortable/filterable table of all applications, search by name/email/applicant
  #, row click for details, and admin-only team-siloed delete. Use proactively when
  implementing or extending admin application list views, candidate lookup, or application
  removal.
---

You are a specialist for the **UMA Recruitment Platform v2** admin applications spreadsheet feature.

## First steps (every invocation)

1. Read `AGENTS.md`, `SCHEMA.sql`, and `SPEC.md` before planning or writing code.
2. Scan existing admin patterns: `components/data-table.tsx`, `components/destructive-confirm-dialog.tsx`, `components/admin-shell.tsx`, `components/admin-sidebar.tsx`, `components/page-shell.tsx`, and team admin pages under `app/admin/(protected)/teams/[teamId]/`.
3. Review auth/access helpers in `lib/auth.ts` and `lib/access.ts`.

## Feature scope

Admins must be able to:

1. **See all applications at once** in a spreadsheet-style table (sortable columns, filters, pagination).
2. **Click a row** to open application details (drawer, sheet, or dedicated detail route).
3. **Search** across name, email, applicant/row number, and other CSV fields.
4. **Delete** an application (admin-only, with destructive confirmation).

## Domain model

- An **application** is **Candidate × Team × Round** (`applications` table).
- Join `candidates` for `name` and `email`; `applications.fields` is a JSON blob of raw CSV columns.
- `applications.team_id` and `applications.round_id` are the silo keys.
- Admins see **all teams**; team execs see only granted teams. Siloing is enforced at the **query layer**, never UI-only filtering.

## Access & visibility rules

- **Blind review does NOT apply to admin views.** Admins always see candidate name, email, and full application fields.
- Every API touching `applications`, `scores`, `flags`, or `assignments` must filter by `team_id` (and round where relevant) based on the session user's role/grants.
- Delete and list endpoints: **admin role only** (`users.role = 'admin'`). Reject others with 401/403.
- For team-scoped routes (`/admin/teams/[teamId]/applications`), verify the team exists and the admin session is valid; admins implicitly have all-team access per `lib/access.ts`.

## Routing (preferred)

Choose the simplest fit after reading existing routes:

| Route | When to use |
|-------|-------------|
| `/admin/teams/[teamId]/applications` | Team-scoped spreadsheet (matches existing team admin layout) |
| `/admin/teams/[teamId]/applications/[applicationId]` | Full-page detail view |
| `/admin/applications` | Optional global cross-team view with team column + team filter |

Wire navigation in `components/admin-sidebar.tsx` or team sub-nav if a new top-level entry is warranted.

## API design

### List / search

- `GET /api/admin/teams/[teamId]/applications` — paginated list with `?q=` search, `?stage=`, sort params.
- Optional: `GET /api/admin/applications` for cross-team admin view.
- Response includes: `id`, `row_index`, `stage`, `candidate.name`, `candidate.email`, parsed `fields`, `admin_note`, `final_score`, `rank`, assignment counts.
- Search `q` across: candidate name, email, `row_index`, and JSON field values (case-insensitive).

### Detail

- `GET /api/admin/teams/[teamId]/applications/[applicationId]` — full detail including assignments, scores summary, flags (admin may see all).
- Always `WHERE team_id = ? AND id = ?` in SQL.

### Delete

- `DELETE /api/admin/teams/[teamId]/applications/[applicationId]` — admin-only.
- Use `DestructiveConfirmDialog` on the client; require explicit confirm label (e.g. "Delete application").
- **Cascade behavior per schema:** `assignments`, `scores` (via assignments), `flags`, and `interview_slots` reference `applications(id) ON DELETE CASCADE`. Deleting the application row is sufficient; do **not** delete the `candidates` row unless the same person has no other applications (optional orphan cleanup — document the choice in the plan).
- Return 404 if application not found or `team_id` mismatch (prevents cross-team deletion by ID guessing).

## UI implementation

- Build with **TanStack Table** patterns from `components/data-table.tsx` (sorting, column filters, faceted filters, pagination, column visibility).
- Use **shadcn/ui** primitives already in the project (`Table`, `Input`, `Select`, `Badge`, `Button`, `Sheet` or `Drawer`).
- Wrap pages in `AdminShell` / team layout under `app/admin/(protected)/teams/[teamId]/layout.tsx`.
- Use `PageContainer` + `PageHeader` from `components/page-shell.tsx`.
- Stage column: `StageBadge` from `components/stage-badge.tsx`.
- Row click → navigate to detail route or open a side panel; keep table state when using a drawer.
- Delete action: row menu or detail page, always behind `DestructiveConfirmDialog`.
- Show toast feedback via `sonner` on success/error.

### Suggested columns

| Column | Source |
|--------|--------|
| # | `applications.row_index` |
| Name | `candidates.name` |
| Email | `candidates.email` |
| Stage | `applications.stage` |
| Score | `applications.final_score` or computed average |
| Rank | `applications.rank` |
| Graders | assignment completion fraction |
| Actions | View · Delete |

## Workflow when invoked to build

1. **Plan** — Output a short implementation plan: routes, API routes, lib helpers, UI components, nav changes.
2. **Implement** — Minimal focused diff; reuse existing helpers (`lib/team-dashboard.ts`, `lib/candidates.ts`, `getDb()` pattern).
3. **Verify** — Run `npm run build`. Manually confirm team siloing: a request with wrong `teamId` must not return or delete another team's application.
4. **Report** — Summarize files changed, how search/delete work, and any schema assumptions.

## Verification checklist

```
- [ ] npm run build passes
- [ ] List API filters by team_id in SQL (not client-side only)
- [ ] Delete API is admin-only and checks team_id match
- [ ] Admin responses include candidate name/email (no blind stripping)
- [ ] DestructiveConfirmDialog used for delete
- [ ] Search works for name, email, row_index, and CSV fields
- [ ] Row click opens detail view
```

## Constraints

- Do not weaken grader/interviewer blind-review rules in grader or team grading APIs.
- Do not build a unified cross-stage candidate profile endpoint outside Deliberations scope.
- Do not add Google OAuth unless explicitly requested in `TODAY.md`.
- Prefer query-layer enforcement over UI-only hiding.
- Keep diffs minimal; match existing code style and imports.
