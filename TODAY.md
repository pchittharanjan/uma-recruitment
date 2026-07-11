# Today's Build — Scope Fence

Read `AGENTS.md`, `SPEC.md`, and `SCHEMA.sql` first. This file scopes down what to actually build **today** — everything else in `SPEC.md` is real and coming later, but not now.

## Build today (in this order, stop between each for review)

1. **Schema migration** — replace `lib/db.ts`'s `SCHEMA_STATEMENTS` and typed helpers with `SCHEMA.sql`. Keep the Turso client setup (HTTPS transport override) as-is. Use your existing `recruitment` Turso DB; drop v1 tables first if the old app already ran on it.
2. **Seed data** — insert the three `teams` rows (`Strategy`, `Events`, `Design`) and one bootstrap admin `users` row.
3. **Auth (placeholder for today)** — do NOT build Google OAuth today. Use a simple shared-secret scheme instead, same pattern as v1.0's `admin_token`: one password/token per role (`admin`, `team_exec`), checked via a plain form, stored in `users` or a simple session cookie. This is temporary — Google OAuth (already decided: restricted to `@berkeley.edu`) replaces this in a later session, once the Application-stage pipeline below is working. Keep the swap isolated: don't wire role/team logic to *how* someone authenticated, wire it to the `users.role` row itself, so swapping the auth mechanism later doesn't require touching the rest of the app.
4. **Application stage only** — for all three teams:
   - CSV import per team/round (reuse v1.0's column-mapping logic, adapted to write into the new `applications` table with `team_id`/`round_id`)
   - Blind review: strip candidate name/identifying fields from any response served to a `team_exec` or `ad_hoc_exec` role at the `application` stage — enforce in the query/serializer, not the frontend
   - Scoring UI (reuse v1.0's grader scoring flow, adapted to the new `assignments`/`scores` tables scoped by `stage = 'application'`)
   - Admin dashboard: progress view + finalize, scoped per team

## Explicitly NOT today

- First Round / Final Round interview flow
- Red/green flags
- Deliberations (unified profile, canvas, follow mode)
- Ad hoc exec grant/revoke UI (seed any needed access manually via SQL for now)
- Round persistence tooling beyond "a round exists as a row" — no need for a polished "create new round" UI yet

If Cursor's plan starts touching any of the "explicitly NOT today" items, stop it and redirect back to this list.

## Definition of done for today

Three teams each have their own Application-stage pipeline: an admin can import a CSV for Strategy, Events, or Design independently, assign graders, graders log in via Google OAuth and see only their assigned applications (names hidden), and an admin can view per-team progress and finalize per-team results. A Strategy exec should not be able to see Design's applications under any circumstance — test this explicitly before calling today done.
