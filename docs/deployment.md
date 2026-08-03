# Deployment guide

CoopPilot is deployed as a Next.js application on Vercel with managed
Supabase for Auth and PostgreSQL. This document covers preparation,
deployment, and rollback. **The production deployment itself has not been
run yet**; see `docs/production-smoke-test.md`.

## Prerequisites

- A Supabase project (Auth + PostgreSQL). Migrations are applied through the
  project's migration tooling in order; never edit production schema by hand.
- A Vercel project connected to the `main` branch of this repository.
- Environment variables (see below). Secrets are configured in Vercel and
  Supabase dashboards, never committed.

## Environment variables

Server-side (never exposed to the browser):

| Variable                    | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` | Used only by seed/admin tooling; ordinary requests do not hold it. |
| `SEED_DEMO_PASSWORD`        | Password for the seeded Demo account.                              |
| `AI_MODE`                   | Must be `demo` in the MVP; external provider is deferred.          |

Client-safe (`NEXT_PUBLIC_*`, public by design):

| Variable                        | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (HTTPS in production). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key.                            |
| `NEXT_PUBLIC_APP_URL`           | Canonical HTTPS base URL.                   |

`.env.example` contains the same names with placeholder values only.

## Pre-deployment gate

```bash
npm ci
npm run verify
npm run build
npm run predeploy:check
```

`predeploy:check` verifies: clean production build, environment schema,
migration file order and clean git state, no test-only flags in production,
secret scan, and required documentation. It never prints secret values.

## Deploy steps

1. Push the approved commit to `main`; GitHub Actions runs verify/build and
   the Playwright E2E + accessibility jobs.
2. Apply migrations to the production Supabase project in order
   (`supabase/migrations/*.sql`). Confirm tables, RLS policies, function
   ACLs, and indexes match the committed migrations.
3. Configure production environment variables in Vercel (see above). Do not
   configure an AI key; Demo Mode is the MVP implementation.
4. Deploy the `main` SHA from Vercel.
5. Verify HTTPS, protected-route redirects, Auth callback/site URL and
   redirect allowlist, and that the browser bundle contains no secrets.
6. Run the production smoke test (`docs/production-smoke-test.md`) with
   temporary users and record the results.

## Migrations and rollback

- Migrations are additive and ordered by filename. New database changes must
  be a new migration file; published migrations are never edited.
- Rollback is a corrective migration, never a manual edit or destructive
  reset.
- Preview deployments use their own Supabase project or database; previews
  never share production seed credentials.

## AWS note

No AWS platform decision has been made. When one is chosen (App Runner,
ECS, or other), introduce a production Dockerfile using Next.js
`output: "standalone"` and re-run `npm ci` in the deployment image.
