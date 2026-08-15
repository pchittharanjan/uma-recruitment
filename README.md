# UMA Recruitment Platform

Multi-team recruitment hub for the Undergraduate Marketing Association. Admins import applications, configure per-team pipelines, and track progress. Team execs grade applications and run interviews under role-scoped sessions (blind review at Application stage).

## Local Development

### 1. Set up Turso

1. Sign up at [turso.tech](https://turso.tech)
2. Install the CLI: `brew install tursodatabase/tap/turso`
3. Log in: `turso auth login`
4. Create a database: `turso db create recruitment`
5. Get the URL: `turso db show recruitment --url`
6. Create an auth token: `turso db tokens create recruitment`

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in:

- `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` — Turso credentials
- `ADMIN_AUTH_TOKEN` / `TEAM_EXEC_AUTH_TOKEN` — shared passwords for placeholder auth (one per role)

### 3. Run

```bash
npm install
npm run dev
```

Dev always binds to **port 3001** (webpack; more stable than Turbopack on this machine). Visit [http://localhost:3001/login](http://localhost:3001/login).

If the server dies or the port is stuck:

```bash
npm run dev:restart
```

That only frees port 3001 for this app — it does not kill other projects' `next` processes. Optional Turbopack: `npm run dev:turbo`.

---

## How It Works

### Login

Sign in at `/login` with the shared password for your role (`admin` or `team_exec`). Sessions map to a `users` row; role and team access come from the database, not from how you authenticated.

### Admin (`/admin/...`)

After admin login:

- **Dashboard** (`/admin/dashboard`) — org-wide progress and phase overview
- **Import** (`/admin/import`) — CSV import and grader setup
- **Teams** (`/admin/teams/[teamId]/...`) — per-team assignments, rubric, schedule, finalize, interview results
- **Applications**, **advancements**, **users**, **communications**, **coffee chats** — supporting admin tools

### Team grading (`/team/...`)

Team execs land on `/team` and work under `/team/[teamId]/...`:

- **Grade** — blind application review and scoring
- **Advancement** — move candidates between stages
- **Interviews** — first/final round interview scoring

### Coffee chats

Members can log coffee chats at `/coffee-chats` (separate from the admin/team pipelines).

---

## Deployment: Vercel + Turso

1. Push this repo to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add environment variables in Vercel project settings:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `ADMIN_AUTH_TOKEN`
   - `TEAM_EXEC_AUTH_TOKEN`
4. Deploy

The DB schema is applied on first request via `initDb()` — see `SCHEMA.sql`.

---

## Docs

- `SPEC.md` — product/architecture spec (v2)
- `SCHEMA.sql` — database schema
- `AGENTS.md` — enforcement rules (team siloing, blind review, auth)
- `TODAY.md` — current build scope fence
