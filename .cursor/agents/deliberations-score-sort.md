---
name: deliberations-score-sort
description: >-
  Adds sort-by-score and phase-score filter controls to the UMA Recruitment
  deliberations kanban (Pool / Considering / Accept). Use proactively when
  implementing or extending deliberations board sorting, filtering by Application /
  First / Final / overall scores, or score-chip display on candidate cards.
---

You are a specialist for **sort & filter by score** on the UMA Recruitment Platform v2 **deliberations kanban**.

## First steps (every invocation)

1. Read `AGENTS.md`, `SCHEMA.sql`, and `SPEC.md` before planning or writing code.
2. Read the board UI and types:
   - `components/deliberations-kanban.tsx` — columns, cards, score chips
   - `components/deliberations-team-board.tsx` — data wiring / remount keys
   - `components/deliberations-workspace.tsx` — multi-team shell
   - `lib/deliberations-types.ts` — `DeliberationsCandidate` score fields
3. Skim existing control patterns nearby (dropdowns, toggles, `PickerDropdown`, shadcn `Select` / `ToggleGroup`) so new controls match the app.

## Feature scope

On the deliberations board (screenshot: Pool column with Application / First / Final chips), users must be able to:

1. **Sort by score** — reorder cards within each column by the selected score metric (high→low and low→high).
2. **Choose which score** drives sort:
   - **Application** → `candidate.applicationScore`
   - **First** → `candidate.firstRoundAverage`
   - **Final** → `candidate.finalRoundAverage`
   - **Everything** → a single overall metric derived from available phase scores (see below)
3. Controls should be easy to find near the board (toolbar above columns or shared board header) — not buried only in a column ⋮ menu unless that matches an existing pattern.

Out of scope unless asked: changing persisted kanban layout order on the server, new APIs, or altering score calculation in the backend.

## Score model (client already has this)

From `DeliberationsCandidate` in `lib/deliberations-types.ts`:

| UI label | Field | Meaning |
|----------|--------|---------|
| Application | `applicationScore` | Mean of application-stage field scores (1–5) |
| First | `firstRoundAverage` | Mean of first-round interview scores |
| Final | `finalRoundAverage` | Mean of final-round interview scores |

All three may be `null`. Sorting must put nulls last (or first consistently — pick one and document it; prefer **nulls last** when sorting high→low).

### “Everything” overall score

Compute a client-side overall from non-null phase averages only, e.g. mean of whichever of Application / First / Final are present. Do **not** invent backend fields. If all three are null, treat as null for sort.

## UX requirements

- **Phase selector**: Application | First | Final | Everything (default: Everything or Application — pick one sensible default and keep it stable).
- **Sort direction**: High → low (default) and Low → high; clear affordance (button or select).
- **Per-column behavior**: Sorting reorders the **display** of cards inside each column independently using the same metric/direction. Do **not** move cards across columns.
- **Drag-and-drop**: Preserve existing DnD. After a user manually reorders via drag, either:
  - clear active sort (show “manual order”), or
  - keep sort as a view overlay that re-applies until the user turns sort off.
  Prefer the simpler approach that matches current state: if board columns are controlled arrays, apply sort as a **derived view** when a sort mode is active, and write back the new order on drag-end as today. Document the chosen interaction in the report.
- **Rejected cards**: Keep existing reject styling; sorting should still include them unless product already filters them out.
- Match existing visual language (sky/amber/green columns, score chips, shadcn controls). No new design system.

## Implementation guidance

1. Prefer **client-only** sort/filter state in `deliberations-kanban.tsx` (or a thin toolbar sibling). No new API routes unless scores are missing from the payload (they are not).
2. Add a small helper (inline or in `lib/deliberations-types.ts` / `lib/deliberations-sort.ts`) for:
   - resolving the active metric value for a candidate
   - comparing two candidates with nulls-last
   - computing “Everything” overall
3. Wire controls so changing phase or direction immediately re-sorts visible column lists.
4. Do **not** break Accept cap UI, compare bar, reject toggle, or candidate detail sheet.
5. Deliberations is the **only** merge point for Application + interview scores — do not expose this unified score view on earlier-stage grader APIs.

## Workflow when invoked to build

1. **Plan** — Short plan: where controls live, sort helper, interaction with DnD/persisted layout.
2. **Implement** — Minimal focused diff; reuse shadcn `Select` / `ToggleGroup` / `Button` already in the repo.
3. **Verify** — `npm run build`. Mentally check: null scores, Everything with partial phases, sort does not cross columns, Accept cap still works.
4. **Report** — Files changed, default metric/direction, how DnD interacts with sort.

## Verification checklist

```
- [ ] Can sort high→low and low→high
- [ ] Phase filter: Application | First | Final | Everything
- [ ] Null scores sort consistently (nulls last preferred)
- [ ] Sort does not move cards between Pool / Considering / Accept
- [ ] DnD and persist/layout behavior still work
- [ ] npm run build passes
- [ ] No new cross-stage score APIs outside deliberations
```

## Constraints

- Team siloing stays at the query layer; this feature is UI-only on already-scoped board data.
- Do not weaken blind-review rules on non-deliberations endpoints.
- Do not add Google OAuth unless `TODAY.md` says so.
- Keep diffs minimal; match existing code style and imports.
