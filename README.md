# CoopPilot

CoopPilot is a personal job application companion for co-op and internship
job seekers: profile management, job extraction, application tracking, AI
match analysis, cover letters, interview preparation, and analytics — all
usable without an external AI API key (Demo Mode).

> Status: **Phases 1–2 implemented.** Phase 1: public pages, protected
> application shell, Supabase authentication, RLS-protected profile baseline,
> repeatable demo seed. Phase 2: complete user profile — basic information,
> job preferences, education, skills (six categories with deduplication),
> work experience, and projects, all persisted in PostgreSQL with RLS and
> server-side validation. Later phases (applications, AI, analytics,
> deployment) are tracked in `docs/implementation-plan.md`.

## Development environment and CI

- **Local development currently runs on Windows.** All Phase 1–2 work was
  developed and verified on Windows (PowerShell + Node.js).
- **Linux is the cross-platform quality gate.** Every push to `main` and
  every pull request triggers
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on the latest
  stable Ubuntu runner, which runs `npm ci`, `npm run verify`, and
  `npm run build`.
- **When migrating to Linux/AWS, re-run `npm ci`** on the target machine
  (or in the deployment image). `node_modules` is never committed, and the
  lockfile pins the exact dependency versions, including platform-specific
  packages.
- **`.env.local` never travels with Git.** It is ignored
  (`.env*.local`), so the deployment environment must be configured with its
  own Supabase project URL, anon key, service-role key, and seed password.
- Line endings are normalized by `.gitattributes` (LF in the repo, platform
  default on checkout; shell scripts, YAML, and Dockerfiles stay LF).

### AWS deployment note

No AWS platform has been decided yet (App Runner vs. ECS vs. other). Until
that decision is made, the repository intentionally does **not** include a
production Dockerfile or AWS infrastructure configuration. The next
deployment milestone should introduce a production Dockerfile using
Next.js's `output: "standalone"` build once the platform is chosen.

## Prerequisites

- Node.js 20.9+ (Node 24 used during development)
- A Supabase-compatible backend:
  - **Hosted Supabase project** (recommended for real use), or
  - a Docker-free local backend such as `tinbase` (`npx tinbase start`),
    which applies `supabase/migrations` and speaks the standard Supabase
    protocol. The RLS tests in `tests/` run against a real embedded
    PostgreSQL, so RLS behavior is verified independently of the local
    backend engine.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```

Required environment variables (names only — no secrets are committed):

| Variable                        | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (e.g. `http://127.0.0.1:54321` locally) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe for the browser)                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only; required by the seed script                     |
| `SEED_DEMO_PASSWORD`            | Password for the seeded demo account                         |
| `NEXT_PUBLIC_APP_URL`           | Application base URL                                         |

Missing or placeholder values produce a clear configuration error instead of
silently misbehaving.

## Database

- Migrations: `supabase/migrations/*.sql` (repeatable, committed).
- Seed: `supabase/seed.sql` plus the `scripts/seed.mjs` driver.

```bash
node scripts/seed.mjs   # requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_DEMO_PASSWORD
```

The seed is idempotent: it creates (or updates) the Demo user and profile.
The demo password comes from the environment; no fixed credential is shipped.
On hosted Supabase, apply `supabase/seed.sql` via the SQL editor or
`supabase db seed`.

## Quality gates

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint (Next + TypeScript)
npm test            # Vitest unit + RLS integration tests
npm run format:check
npm run verify      # all of the above
npm run build       # production build
```

The RLS integration tests boot a real embedded PostgreSQL, apply the
committed migrations, create two users, and prove that neither can read,
update, or delete the other's profile, education, skills, experience, or
projects at the database layer.

## Profile workflow

- `/onboarding` — basic information and job preferences; only `preferred
name` is required. Completing onboarding is never required to add or
  manage job applications.
- `/profile` — full profile editor: basic information, preferences,
  education, skills (Enter to add, × to remove), work experience, and
  projects. Reorder lists with the up/down buttons; deletions require
  confirmation.

## Project layout

```text
app/            Next.js App Router routes (public, auth, protected)
components/ui/  Shared UI primitives (button, input, card, toast, theme)
features/       Domain modules (auth, shell)
lib/            env validation, Supabase clients, error taxonomy
supabase/       Migrations and seed
tests/          Unit and RLS integration tests
```

## Known Phase 1 notes

- The `(protected)` shell exposes only Phase 1 routes; unfinished features are
  not linked yet.
- The local Docker-free backend is a development convenience; migrations and
  application code target the standard hosted Supabase contract.
