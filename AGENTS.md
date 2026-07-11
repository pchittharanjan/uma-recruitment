# Agent Instructions — UMA Recruitment Platform v2

Read `SPEC.md` and `SCHEMA.sql` first. This file covers enforcement rules that are easy to get wrong if only implemented at the UI layer.

## Non-negotiable rules

1. **Team siloing is a query-layer rule, not a UI filter.** Every query touching `applications`, `scores`, `flags`, or `assignments` must filter by `team_id` based on the requesting user's role/grants — never rely on the frontend to hide other teams' data. A team exec's session should be structurally incapable of fetching another team's rows.

2. **Blind review at Application stage**: candidate name/identifying fields must not be included in any API response served to a grader role during the `application` stage — not just hidden in the UI. Strip at the query/serialization layer.

3. **Interviewer blindness at First Round**: interviewers assigned at `first_round` must not receive prior Application scores, admin notes, or flags in their view — enforce this the same way as #2.

4. **Deliberations is the single merge point.** Only at `deliberations` stage should a query be allowed to join Application scores + interview scores + flags into one response. Don't build a "unified candidate view" endpoint that's reachable before this stage.

5. **Access grants are checked, not assumed.** `ad_hoc_exec` role must resolve actual access through `access_grants` (team + optional round + optional stage), checking `revoked_at IS NULL`. Don't hardcode any exec's access.

6. **Canvas state is ephemeral by design.** Don't add persistence/history to `canvas_cards` beyond the current session — that's intentional, not a gap to fill in.

## Auth mechanism

**Decided end-state: Google OAuth, restricted to `@berkeley.edu` email addresses.** On sign-in, verify the OAuth email domain server-side and reject non-`@berkeley.edu` accounts before creating or matching a `users` row. This maps a signed-in Google account to a `users.email` row — the `users` table itself is still the source of truth for `role` and team assignment, not the OAuth provider.

**For now (see `TODAY.md`): build a temporary shared-password placeholder instead** — one token per role, same pattern as v1.0's `admin_token`. Wire role/team logic to the `users.role` row itself, not to *how* someone authenticated, so swapping in real Google OAuth later doesn't require touching the rest of the app. Don't build Google OAuth until `TODAY.md` (or a later instruction) explicitly says to.

## Migration from v1.0

v1.0's tables (`config`, `applications`, `graders`, `assignments`, `scores`) don't map cleanly onto v2 — this is a schema replacement, not an ALTER-based migration. If any v1.0 data needs preserving (e.g. a round already in progress), write a one-off backfill script rather than trying to evolve the old schema in place.

## Suggested stack carryover from v1.0

Keep what worked: Next.js, Turso (libSQL), Vercel deploy. The `getDb()` pattern in `lib/db.ts` (HTTPS transport override for serverless) is worth keeping as-is.

## Build order

Follow §9 in `SPEC.md`. Do not build the Deliberations canvas before the core pipeline (Application → First Round → Final Round) works end-to-end for a single team — it's the highest-complexity, most deferrable piece.