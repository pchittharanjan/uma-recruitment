# UMA Grading Site — Design System

Built on shadcn/ui (Radix + Tailwind). Tokens below map to shadcn's CSS variable convention so the doc and the code stay in sync.

## Colors

CSS variables (shadcn convention):

| Token | Value | Use |
|---|---|---|
| `--primary` | `#EF9251` | primary actions, active states |
| `--secondary` | `#9C5E8D` | secondary actions, accents |
| `--accent` | `#DD6A56` | highlights, badges |
| `--destructive` | `#DD6A56` | errors, destructive actions |
| `--background` | `#FFFFFF` | page/card background |
| `--foreground` | *TBD* | primary text (needs a dark neutral, not yet defined) |

Gradient (marketing/landing surfaces only, not core app UI): linear or radial blend across `#EF9251 → #DD6A56 → #E8A060`. Pair with white text.

## Typography

- **Mugler Regular** — display/marketing headlines only (128 / 200). Not used in the grading app itself.
- **Absans** — all in-app UI text, sizes 20 / 32 / 48.

Open question: does the grading tool need its own plainer UI scale (e.g. 14/16/20/24) rather than reusing the marketing sizes? Flag if so — will add a dedicated UI type scale.

## Components

Core shadcn/ui primitives for this build:

- **Data Input**: Field, Select, MultiSelect, Textarea, Calendar/DateRange — applications, rubric scoring
- **Table & List**: Table w/ sort, filter, sticky columns — candidate lists across Strategy/Events/Design
- **Overlay**: Dialog, Popover, Toast, Command — confirmations, quick actions
- **Feedback**: Badge, Progress — phase indicators (Pre-App → Application → Interviews → Deliberations)
- **Navigation**: Sidebar, Tabs, Breadcrumbs — admin vs. team-exec views

## Notes

- Deliberations drag-and-drop candidate canvas is custom (`dnd-kit`), not a stock component in shadcn or any evaluated library.
- `--foreground` and a UI-scale type ramp are still open — fill in once decided.

## Product decisions (confirmed)

These govern implementation across phases. Do not contradict without explicit sign-off.

### Rubric: org-wide

One org-wide application scoring criteria set is shared across Strategy, Events, and Design. Stored in `org_rubric` (single row). Saving grading setup from any team updates org defaults and propagates to all active rounds (intersected with each team’s CSV headers). New imports inherit org rubric when present.

### Interview assignment: manual

Interviewers are assigned manually on the interview schedule grid only. **Do not** auto-assign from the grader pool when advancing to first round. Application finalize only updates `applications.stage` and `rounds.status` — no `first_round` assignments are created at cutoff.

### Finalize authority: admin-led during delibs

When the pipeline is at Deliberations, team members (execs, directors, ad hoc) get the same interactive board as admin — they can rearrange and explore placements locally. **Save and advance/commit remain admin-only** (not directors, not team execs). Team execs/PMs must not finalize phase cuts independently during active recruitment.

### Delibs columns: customizable per person

Each deliberations participant has their own column layout / personal board (not fixed per team). Canvas card positions remain session-scoped per user.

### Cross-team placement

Teams may discuss candidates during deliberations, but a candidate can only be **placed on one team**. Admin-only “claimed by [Team]” when someone appears in multiple teams’ delibs pools. Enforce single-team placement at commit time (future delibs phase).
