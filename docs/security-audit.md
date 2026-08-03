# Security audit

Audit date: 2026-08-02. Status: all automated checks pass; no known
unresolved findings. Managed Supabase production verification is deferred
until credentials are available (see `docs/deployment.md`).

## RLS and ownership

- Every user-owned table (12 tables) is RLS-enabled and covered by the
  two-user matrix in `tests/rls-full-matrix.test.ts`: SELECT/INSERT/UPDATE/
  DELETE for user A and user B, spoofed cross-user inserts, child-row parent
  checks, and append-only tables.
- Append-only tables (`ai_runs`, `match_analyses`, `generated_documents`,
  `application_status_events`) allow ordinary users to select their own rows
  only; writes go through controlled security-definer RPCs.
- Service layer returns Not Found for other users' resources; this is
  covered by service tests in addition to RLS.

## Security-definer RPC audit

`tests/rpc-security-audit.test.ts` scans every public `security definer`
function from the PostgreSQL catalog and verifies:

- Fixed `search_path = public`.
- No dynamic SQL (`EXECUTE` with constructed strings).
- First-line `auth.uid()` identity check (except the auth-users trigger).
- No PUBLIC or anon EXECUTE; authenticated EXECUTE only on the designed
  entry points.
- Retired/internal RPCs (`insert_generated_document`, `lock_ai_run`) are
  actually denied.

Migration `20260802000009_phase7_security_hardening.sql` revoked the
default PUBLIC EXECUTE from the pre-Phase-5 definer functions that still had
it (audit finding) and added the parameterized search RPC.

## Plain-text rendering / XSS

- `dangerouslySetInnerHTML` is not used anywhere; `innerHTML`/`eval`/
  `new Function` are absent from application code.
- `tests/xss-plain-text.test.tsx` renders script-like fixtures in the
  applications table, board, analytics lists, and cover letter editor and
  verifies they are displayed as text and `window.__xss` is never set.
- The Playwright suite fails on any unexpected console/page errors,
  including failed requests.

## URLs and redirects

- All user-provided URL fields (posting, LinkedIn, GitHub, website, project
  GitHub/demo, interview links) accept only `http:`/`https:` and reject
  `javascript:`, `data:`, `file:`, and `vbscript:` (`lib/validation/shared.ts`
  and `lib/validation/applications.ts`; `tests/url-security.test.ts`).
- The login `next` query parameter is not consumed by the login form, so
  there is no open-redirect vector; the middleware only redirects to
  relative site paths.

## Search/filter injection

Application search and required-skill filtering use the parameterized
`search_application_ids(uuid, text, text)` RPC; PostgREST `.or()` filter
strings are never built from user input. `tests/search-injection.test.ts`
verifies `, ( ) " ' % _ \ ; --` and OR-injection attempts cannot expand the
query, leak other users' rows, or produce raw database errors.

## Secrets

- `npm run secret:scan` scans all committed files for service-role JWTs,
  API keys, private keys, tokens, and seed passwords; it exits non-zero on
  any finding and prints only redacted fragments.
- The scan is part of `npm run predeploy:check` and GitHub Actions.
- `.env.local`, local logs, and Playwright artifacts are gitignored.
- No secret appears in the browser bundle, network responses, or docs.

## Security headers

The proxy (`proxy.ts`) sets on every response:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (only when `NEXT_PUBLIC_APP_URL` is HTTPS)

A CSP is intentionally not shipped: it would require verification against
Next inline scripts and Supabase Auth across the full workflow before it can
be enabled without breaking the product.

## Dependency audit

- `npm audit` and `npm audit --omit=dev`: **0 vulnerabilities** after
  overriding Next's nested `postcss` to the fixed 8.5.25 (`$postcss`
  override) and `sharp` to 0.35.3.
- Remaining `npm outdated` entries are major-version jumps (eslint 10,
  tailwindcss 4, typescript 7) and are intentionally not taken in this
  phase.
- Install scripts are required for: `sharp` (native image processing used by
  Next), `@embedded-postgres/*` (native PostgreSQL binaries for the RLS test
  suites), `unrs-resolver` (Rust resolver used by the Next toolchain), and
  `fsevents` (macOS-only optional watcher). No wildcard script approval is
  used.

## Known deferred items

- Managed Supabase verification of migrations, real Auth JWTs, and
  two-user RLS (needs project credentials).
- External AI provider (explicitly deferred; Demo Mode is the MVP
  implementation).
