# CoopPilot Implementation Plan

## 1. Delivery rules

This plan follows the seven phases in the CoopPilot PRD while breaking each phase into small, independently testable increments. Work should stop at each increment until its acceptance checks pass.

General rules for every increment:

- Do not implement features listed as out of scope.
- Add or update automated tests with the behavior being introduced.
- Keep database migrations repeatable and committed.
- Verify user ownership for every new read and mutation.
- Include loading, empty, success, and recoverable error states for completed UI.
- Do not leave a primary button connected to a placeholder action.
- Preserve usability without an external AI API key.

## 2. Phase 1 — Foundation

### 1A. Project scaffold and quality gates

Deliverables:

- Initialize the Next.js TypeScript application.
- Configure formatting, linting, unit tests, and environment validation.
- Establish domain-oriented folders and shared UI primitives.
- Add `.env.example` with names but no secrets.

Acceptance criteria:

- A clean install can run the development server.
- Type checking, linting, and the empty test suite complete successfully.
- Missing required environment variables produce a clear startup/configuration error.
- No secret or local environment file is tracked.

### 1B. Public pages and responsive application shell

Deliverables:

- Landing, Sign Up, and Login page layouts.
- Protected application shell with sidebar, mobile navigation, theme support, loading shell, and toast region.
- Empty Dashboard state that offers a working path to onboarding or Add Job once authenticated.

Acceptance criteria:

- Public pages render at 375px, tablet, and desktop widths without horizontal overflow.
- Main navigation is keyboard accessible and has visible focus.
- Light/dark mode persists across refreshes.
- Every rendered navigation item leads to an existing route; unfinished protected features are not exposed yet.

### 1C. Database baseline, authentication, and RLS

Deliverables:

- Supabase configuration and initial migrations.
- Email/password sign-up, login, logout, persistent session, and protected route handling.
- Initial profile/application ownership policies.
- Controlled seed script with a Demo user and realistic records.

Acceptance criteria:

- A user can register, log in, refresh, remain logged in, and log out.
- Invalid credentials show a clear non-technical error.
- An unauthenticated request to any protected page redirects to Login.
- Two-user automated tests prove user A cannot read, update, or delete user B data, including direct database access under RLS.
- The seed process is repeatable and does not expose an admin credential to the browser.

Phase 1 exit criterion: authentication, protected layout, persistent database connection, and user isolation work together in a deployed-like local environment.

### Phase 1 verified status — 2026-08-01

Status: **COMPLETE — implemented and verified** (all Phase 1 acceptance
criteria pass in the local verification environment).

Implemented:

- 1A: Next.js 16 (App Router) + TypeScript 5 + Tailwind CSS scaffold.
  ESLint 9 flat config, Prettier, Vitest + Testing Library, environment
  validation with clear configuration errors, domain-oriented folders
  (`app/`, `features/`, `components/ui/`, `lib/`), and `.env.example` with
  names only.
- 1B: Landing, Sign Up, and Login pages; protected shell with desktop
  sidebar, labelled mobile navigation, light/dark theme persisted via
  `next-themes` (localStorage), loading shell, toast region, and an empty
  Dashboard that links to the working Add Job and Onboarding routes. Only
  Phase 1 routes are exposed in navigation.
- 1C: Supabase migrations (`supabase/migrations/20260801000000_*` and
  `20260801000001_*`) creating `user_profiles` with RLS policies for all four
  operations, `updated_at` trigger, automatic profile creation on sign-up,
  HTTP/HTTPS URL constraints, and indexes. Email/password sign-up, login,
  persistent session, sign-out, and server-side protected route enforcement
  (proxy/middleware refresh + page-level session checks). Repeatable seed
  (`scripts/seed.mjs` + `supabase/seed.sql`) creates a Demo user with a
  realistic profile; the password is read from `SEED_DEMO_PASSWORD` and is
  never committed.

Verification evidence:

- `npm run verify` passes: TypeScript, ESLint, Prettier, and 11 tests
  (unit tests for env validation and toast; integration tests that boot a
  real embedded PostgreSQL, apply the committed migrations, and prove
  two-user isolation at the database layer under RLS).
- `npm run build` produces a clean production build (all routes compile;
  proxy recognized).
- `npm run dev` serves all public pages (HTTP 200). Unauthenticated
  `/dashboard` returns 307 to `/login?next=...`; with a live session cookie
  it renders the Dashboard (200). Fresh sign-up creates a session and the
  profile trigger creates a profile row; sign-out immediately redirects
  protected pages again.
- Missing required environment variables produce a clear configuration error
  naming the variables (verified against a server started without
  `.env.local`).
- `.env.local` and local log files are ignored; `git status` shows no
  environment file tracked.
- Seed script verified twice in a row (idempotent: creates, then updates).

Local verification environment notes:

- This machine has no Docker, so the official Supabase CLI local stack cannot
  run here. The app was verified against a Docker-free Supabase-compatible
  local backend that applies the same `supabase/migrations` and speaks the
  standard Supabase protocol. The migration and RLS acceptance tests run
  against a real embedded PostgreSQL, so Row Level Security behavior is
  verified independently of the local backend engine.
- Responsive layouts are mobile-first with no fixed widths; a visual
  browser pass at 375px/tablet/desktop is scheduled for the Phase 7
  responsive audit, per the plan.
- Git: the workspace's pre-existing `.git` directory was replaced with a
  fresh repository during verification.

Phase 2 has not been started. No out-of-scope feature was added.

## 3. Phase 2 — User profile

### 2A. Basic information, education, and preferences

Deliverables:

- Onboarding and Profile Editor for basic information.
- Education list CRUD.
- Preference fields for locations, remote work, term length, target roles, and availability.
- Shared URL/date validation and explicit save state.

Acceptance criteria:

- Required onboarding fields block completion until valid.
- Only HTTP/HTTPS URLs are accepted for LinkedIn, GitHub, and website fields.
- Education can be added, edited, reordered, and deleted.
- Saved data survives refresh, logout, and login.
- Server tests reject attempts to update another user's profile or education.

### 2B. Skills editor

Deliverables:

- Editors for programming languages, frameworks, cloud platforms, tools, concepts, and spoken languages.
- Skill normalization and duplicate prevention.

Acceptance criteria:

- Adding the same normalized skill twice in one category creates only one record.
- Users can add and remove skills with keyboard controls.
- Category labels are visible and programmatically associated with their controls.
- Persisted skills reload in their correct categories.

### 2C. Experience and project management

Deliverables:

- Experience and Project CRUD with dynamic bullet points.
- Project technologies, GitHub URL, and Demo URL.
- Date-order validation and delete confirmations.

Acceptance criteria:

- A user can add, edit, reorder, and delete multiple experiences and projects.
- An end date earlier than a start date is rejected by client and server validation.
- Cancelling a delete confirmation leaves the record unchanged.
- URL validation and persistence tests pass.
- No profile mutation can affect a second user's records.

Phase 2 exit criterion: every profile field required by the PRD is editable, validated, owned by the current user, and persistent.

### Phase 2 verified status — 2026-08-02

Status: **COMPLETE — implemented and verified** (all Phase 2 acceptance
criteria pass; Phase 3 has not been started).

Implemented:

- 2A: Onboarding (`/onboarding`) and Profile (`/profile`) forms for basic
  information (preferred name, phone, location, LinkedIn/GitHub/website URLs)
  and preferences (locations, remote preference, term lengths, target roles,
  available start date). Only `preferred_name` is required (O-13 resolved);
  empty or whitespace-only names are rejected on both client and server.
  Education list CRUD with keyboard-accessible reordering, shared URL/date
  validation, and explicit save state with success/error toasts.
- 2B: Skills editor with the six required categories, normalization and
  deduplication by normalized name per category (TagInput adds via Enter;
  per-tag remove buttons are keyboard-usable; category headings are
  programmatically associated with their controls via labels).
- 2C: Experience and Project CRUD with dynamic bullet points, project
  technologies and GitHub/Demo URLs, end-date >= start-date validation on
  client and server, and focus-managed confirmation dialogs for deletion.
- Database: `educations`, `profile_skills`, `experiences`, and `projects`
  tables with RLS policies for select/insert/update/delete, `updated_at`
  triggers, CHECK constraints, indexes, and a security-definer
  `replace_profile_skills` RPC that verifies `auth.uid()` before replacing a
  user's skill set.
- Seed: demo account now includes one education, eleven skills across
  categories, one experience, and one project; the seed remains repeatable
  and idempotent (fixed record ids).

Verification evidence:

- `npm run verify` passes: TypeScript, ESLint, Prettier, and 42 tests.
- `npm run build` produces a clean production build.
- New automated tests: schema validation (URL protocol, date order, name
  trimming), component tests (client-side onboarding blocking, skill
  keyboard add/dedupe), service tests (ownership scoping, not-found
  behaviour, skill deduplication, onboarding flag, safe database errors),
  and RLS integration tests against a real embedded PostgreSQL proving
  two-user isolation for all four new tables plus RPC ownership checks.
- Live verification against the local stack: migrations applied, seed run
  twice (idempotent), `/profile` and `/onboarding` render with the demo
  user's persisted records, and records survive a fresh sign-in.

Known limitations (deferred by plan): visual browser pass at 375px/tablet/
desktop and automated accessibility checks remain part of the Phase 7 audit;
ordering is via move-up/move-down buttons rather than drag-and-drop.

Defects found during manual browser testing (2026-08-02) and fixed:

- Browser login/signup failed with "Something went wrong" because
  `lib/env.ts` read public env vars with dynamic `process.env[name]`
  indexing; Next.js only replaces static `process.env.NEXT_PUBLIC_*`
  references in browser bundles. Rewritten with static reads so the browser
  Supabase client validates configuration correctly.
- Onboarding and editor forms double-validated: the client passed Zod
  transform output (`null` for unset optionals) back into server actions,
  where the schemas rejected `null`, so every save failed. Schemas now accept
  `null`/`undefined` (`nullish`) and forms submit the original values; the
  server action remains the authoritative validation pass.

Hardening pass (2026-08-02):

- `sort_order` is now assigned by a before-insert trigger (per-user max+1)
  instead of a column default; reordering goes through a transactional
  `swap_sort_order` RPC with a table-name whitelist, ownership check, and a
  `false` result for missing/foreign records.
- Every Server Action parameter (ids, move direction, skill arrays, form
  payloads) is validated at runtime with Zod; invalid identifiers and
  directions are rejected before any database work.
- `update`/`delete`/`move` return Not Found for records that do not exist or
  belong to another user (delete now selects the deleted row to distinguish
  "deleted" from "not found").
- Full RLS test matrix covers insert/read/update/delete cross-user isolation
  on all four Phase 2 tables; sorting tests create three records, reorder
  transactionally, and re-read on a fresh connection to prove persistence.
- Unified unsaved-changes protection: visible "You have unsaved changes"
  notice plus `beforeunload` guarding in the basic info form, skills editor,
  and education/experience/project editors.
- Onboarding shows a recoverable database-load error state instead of
  silently rendering an empty form.
- `seed.mjs` now accepts the same `NEXT_PUBLIC_*` variable names as the app
  (with legacy fallbacks), rejects `.env.example` placeholders, and matches
  `seed.sql` skill data; `.env.example` documents `SEED_DEMO_EMAIL`.
- Component tests added for Education, Experience, and Project CRUD plus
  delete-cancel behaviour (89 tests total).
- Responsive audit passed: `/login`, `/signup`, `/dashboard`, `/profile`,
  `/onboarding`, and `/applications/new` render without horizontal overflow
  at 375px, 768px, and 1280px in a real headless browser.

Phase 3 has not been started. No out-of-scope feature was added.

## 4. Phase 3 — Job management

### 3A. Job analysis contract, Demo extraction, and manual fallback

Deliverables:

- Server-side AI provider interface and extraction result schema.
- Non-empty description and optional URL input form.
- Clearly labelled deterministic Demo extraction when no AI key is configured.
- Editable review form containing every extracted field.
- Manual entry path after analysis failure.

Acceptance criteria:

- An empty description cannot be submitted.
- Demo extraction returns schema-valid output and preserves the full original description.
- Unknown source fields remain null/empty/Unknown rather than being inferred.
- Every returned field can be edited before saving.
- Simulated provider failure displays a helpful error and leaves manual entry usable.
- Repeated Analyze clicks while a request is running produce only one active request.

### 3B. Application create and Job Detail foundation

Deliverables:

- Transactional application creation with skills and initial status event.
- Header, Overview, Requirements, Notes, and interview-date sections on Job Detail.
- Notes autosave indicator.
- Edit, duplicate, and confirmed permanent delete operations.

Acceptance criteria:

- Double-submitting the reviewed form creates exactly one application.
- Saving redirects to the correct Job Detail page.
- All job fields and the original description survive refresh and relogin.
- Notes display Saving, Saved, and failure states; failed saves do not falsely report success.
- Duplicate creates a new record with a new ID and fresh status history.
- Delete requires confirmation and removes dependent records; cancel leaves data intact.

### 3C. Applications table, search, filtering, and sorting

Deliverables:

- Responsive applications table/card view.
- Full-text search over company, job title, notes, and skills.
- Filters for status, company, location, work arrangement, required skill, deadline, and archive state.
- Sorting by all PRD-specified fields.

Acceptance criteria:

- Each filter returns a database-backed, user-owned result set.
- Combined filters behave as an intersection and can be reset.
- Every required sort produces a stable documented order.
- Archived records are hidden by default.
- Mobile users can inspect every displayed field without controls leaving the viewport.
- Search tests cover company, title, notes, and skill matches.

Phase 3 exit criterion: users can create, inspect, edit, duplicate, delete, search, filter, and sort persistent applications, with a manual path when AI fails.

### Phase 3 verified status — 2026-08-02

Status: **COMPLETE — implemented and verified** (all Phase 3 acceptance
criteria pass; Phase 4 has not been started).

Implemented:

- 3A: Server-side AI provider contract (`AIProvider.extractJob`) with a
  schema-validated extraction result; deterministic Demo provider preserves
  the full original description and submitted URL; analyze form rejects empty
  descriptions and disables repeated Analyze clicks; review form exposes every
  extracted field as editable, with a clearly labelled `Demo AI Response`
  banner and a manual entry path (`/applications/new` → "Skip analysis").
- 3B: Transactional application creation (application + skills + initial
  status event in one `create_application` RPC, idempotent per
  `(user_id, creation_key)`); Job Detail page with Header, Overview,
  Requirements, Notes (debounced autosave with Saving/Saved/failure states),
  Interview dates (add/delete), status history, and Original description;
  edit page reusing the review form; duplicate via `duplicate_application`
  RPC (fresh id/creation key/status history, copied job fields and skills);
  permanent delete with focus-managed confirmation.
- 3C: `/applications` responsive table (desktop) / card list (mobile) with
  URL-driven search (company, job title, notes, skills), intersection
  filters (status multi-select, company, location, work arrangement, required
  skill, deadline range, archive state), eight documented sort fields with
  direction toggle, and one-click filter reset. Archived records are hidden
  by default (archive actions themselves arrive in Phase 4).
- Database: `applications`, `application_skills`, `application_status_events`,
  `interviews` tables with RLS policies (child tables verify parent
  ownership), CHECK constraints, indexes, and transactional RPCs
  (`create_application`, `duplicate_application`).
- Seed: demo user now has three applications across statuses (saved/applied/
  interview) with skills, full status history, and one interview.

Verification evidence:

- 153 automated tests pass (validation, service layer, server-action input
  rejection, component tests, real-PostgreSQL RLS matrix for all four new
  tables, RPC idempotency/ownership, and persistence across fresh
  connections).
- `npm run verify` and `npm run build` pass locally and on Ubuntu CI.
- Headless-browser acceptance: login, seeded list, job detail, search
  filtering, analyze → review → save → detail redirect, duplicate, notes
  autosave, and no horizontal overflow at 375/768/1280px with zero console
  errors.

Documented decisions for open plan items: sortable fields are the table's
displayed fields (company, job title, location, deadline, date applied,
status, created/updated); duplication copies job fields + skills and resets
notes, dates, and status history.

Phase 4 has not been started. No out-of-scope feature was added.

## 5. Phase 4 — Application board

### 4A. Seven-column board and cards

Deliverables:

- Saved, Preparing, Applied, Interview, Offer, Rejected, and Withdrawn columns.
- Cards showing company, title, location, deadline, latest match score, date applied, and textual status.
- Column counts, empty columns, and card links to Job Detail.

Acceptance criteria:

- Each non-archived application appears in exactly one correct column.
- Counts match the number of rendered cards.
- Card links open only records owned by the current user.
- Empty states remain usable and do not look like loading failures.

### 4B. Status mutation, drag-and-drop, and mobile fallback

Deliverables:

- Accessible drag-and-drop on supported layouts.
- Transactional status update plus history event.
- Optimistic UI with rollback and error toast.
- Status selector on mobile and as an accessible alternative.

Acceptance criteria:

- A successful move remains in the new column after refresh.
- Each real status change creates exactly one status event.
- A simulated database failure restores the prior card position and announces the error.
- All seven statuses can be selected without drag-and-drop.
- Keyboard users can change a card status.

### 4C. Deadlines and archive workflow

Deliverables:

- Upcoming deadline reminder and expired-unapplied warning.
- Archive action, Archive page, and Restore action.

Acceptance criteria:

- Deadline states are derived from the stored calendar date and covered by boundary-date tests.
- Expired Saved/Preparing applications show a warning; applied-stage records do not receive the unapplied warning.
- Archived applications disappear from the main board/table/dashboard immediately.
- Restored applications reappear in their prior status.
- Archive and restore survive refresh.

Phase 4 exit criterion: the complete seven-state lifecycle is usable and persistent on desktop and mobile, with reliable rollback and archive behavior.

### Phase 4 verified status — 2026-08-02

Status: **COMPLETE — implemented and verified** (all Phase 4 acceptance
criteria pass; Phase 5 has not been started).

Implemented:

- 4A: `/applications/board` with the seven fixed columns; non-archived
  applications only; per-column counts and usable empty states; cards show
  company, job title, location, deadline, date applied, and textual status
  (match score omitted entirely until Phase 5 exists — O-7 resolved); cards
  link to the owning user's Job Detail; stable column order
  `updated_at DESC, id ASC`.
- 4B: `update_application_status` security-definer RPC (locks the row,
  reads `from_status` from the database, validates the seven-status set,
  appends exactly one event per real change, same-status requests are
  no-ops, `auth.uid()` verified first, fixed `search_path`, no dynamic SQL,
  Not Found via NULL return). Drag-and-drop via `@dnd-kit/core` with pointer
  and keyboard sensors; every card also has a status selector (mobile and
  desktop accessible alternative); optimistic moves with rollback, error
  toast, and an `aria-live` announcement on failure. First move to Applied
  with a null `date_applied` shows an optional prompt (enter date / Skip /
  Cancel) committed in the same transaction (O-11 resolved); existing dates
  are preserved and never auto-filled.
- 4C: deadline rules implemented as pure functions (O-6 resolved: upcoming =
  today through today+7 inclusive; expired = deadline < today using the
  stored calendar date); Board shows an upcoming-deadline reminder strip and
  cards show expired-unapplied warnings for Saved/Preparing only. Archive
  action on Job Detail (confirmed), `/archive` page with empty/error states,
  and Restore with success/failure feedback; archive sets `archived_at` only
  and restore clears it, so applications return to their prior status;
  archived applications disappear from Board, the default table, and the
  upcoming reminder immediately.
- Seed: demo user now has six applications covering saved, preparing
  (via status moves), applied, interview, offer, rejected, and withdrawn.

Verification evidence:

- 190 automated tests pass, including: RPC tests on real embedded PostgreSQL
  (seven-status transitions, exactly-one-event, database-sourced from_status,
  same-status no-op, invalid status rejection, cross-user and Not Found
  semantics, append-only enforcement, date_applied input/skip/preserve, rapid
  sequential updates), archive/restore RLS and persistence tests, deadline
  boundary tests (yesterday/today/day 7/day 8/null/status matrix), board
  component tests (single-column placement, counts, empty states, detail
  links, optimistic change, rollback + live-region announcement, applied date
  prompt save/skip/cancel, no re-prompt with existing date), and service
  layer tests.
- `npm run verify` and `npm run build` pass locally and on Ubuntu CI.
- Headless-browser acceptance at 375/768/1280px: seven-column board renders,
  status changes persist after refresh, status history appends correctly,
  archive removes from board/table, archive page lists it, restore returns it
  to its original column, deadline warnings render, and no console errors.

Documented decisions: O-6, O-7, and O-11 are resolved in
`docs/requirements.md` Appendix A.

Phase 5 has not been started. No out-of-scope feature was added.

## 6. Phase 5 — AI job-preparation features

### 5A. AI run infrastructure and provider hardening

Deliverables:

- Complete provider interface for match, cover letter, and interview preparation.
- Schema validation, safe errors, idempotency records, timeouts, and mode labels.
- Deterministic Demo provider implementations for all operations.

Acceptance criteria:

- With no external key, all four AI operations use Demo Mode and display `Demo AI Response`.
- Malformed external output is rejected and never persisted.
- Identical Demo inputs produce identical results.
- Duplicate submissions with one idempotency key create one successful result.
- No AI or service-role secret is present in browser bundles or responses.

### 5B. Resume–job match analysis

Deliverables:

- Overall score and five required weighted components.
- Matching/missing skills, matching experience, relevant projects, keywords, and suggestions with evidence.
- Regeneration and stale-result detection after profile/job edits.

Acceptance criteria:

- Component scores sum to the displayed overall score and stay within their weights.
- A skill absent from the profile is never shown as possessed by the user.
- Missing required and preferred skills are displayed separately.
- Results persist with generation time and mode.
- Editing the profile or job marks the prior result stale; regeneration creates a new snapshot.
- Suggestions never advise fabricating experience.

### 5C. Cover letter generation and revision history

Deliverables:

- Generate, regenerate, edit, copy, save, and restore previous version.
- Pre-generation profile sufficiency check.
- Warning before regeneration when a current edited version exists.

Acceptance criteria:

- Generated output targets the stored company and role and is approximately 250–400 words when sufficient source material exists.
- Every claimed experience/project can be traced to the current user's profile.
- Insufficient profile data produces an actionable prompt instead of invented content.
- Editing and regeneration create versions without deleting the prior version.
- Restore returns the selected prior content and persists it as the current revision.
- Copy provides explicit success/failure feedback.

### 5D. Interview preparation

Deliverables:

- Behavioural questions, technical questions, and research checklist.
- Each question includes why it may be asked, relevant real experience, and an optional outline.

Acceptance criteria:

- Technical questions are tied to stored job skills.
- Suggested personal examples reference only stored experience/projects or state that no relevant example is available.
- The system does not generate fabricated complete personal answers.
- Each content type persists and reloads from Job Detail.
- Regeneration preserves prior versions.

Phase 5 exit criterion: every required AI workflow works in both configured external mode and no-key Demo Mode, persists its results, and does not invent user facts.

## 7. Phase 6 — Dashboard and analytics

### 6A. Analytics query layer and summary cards

Deliverables:

- Shared database-backed calculations for totals, active applications, interviews, offers, deadlines, interview rate, and offer rate.
- Dashboard summary cards with loading and empty states.

Acceptance criteria:

- Fixed seed data produces exact expected values in automated tests.
- Saved and Preparing do not count as applied.
- Interview/Offer reach is based on status history, even after later Rejected/Withdrawn states.
- Archived applications are excluded from main metrics.
- Dashboard performs bounded aggregate queries rather than one query per card.

### 6B. Charts and action lists

Deliverables:

- Applications by status.
- Applications submitted over time.
- Most requested skills.
- Upcoming deadlines, recently updated applications, and applications requiring action.
- Detailed Analytics page using the same calculation layer.

Acceptance criteria:

- Charts reconcile with table records and summary cards for fixed seed data.
- Charts include accessible titles and text/value alternatives.
- No-data states show an appropriate action instead of fake chart values.
- Updating, archiving, or changing an application status is reflected after data refresh.
- Deadline and recent-item ordering is deterministic.

Phase 6 exit criterion: every Dashboard and Analytics value is reproducible from persisted application data and behaves correctly with zero records.

## 8. Phase 7 — Quality and deployment

### 7A. Responsive and accessibility audit

Deliverables:

- Review every public and authenticated route at phone, tablet, and desktop breakpoints.
- Keyboard, focus, labels, error association, contrast, dialog, and non-color status review.

Acceptance criteria:

- No form control or primary action overflows a 375px viewport.
- All core workflows can be completed using a keyboard.
- Automated accessibility checks report no serious violations on core pages.
- Every input has a label; every validation error is associated with its input.
- Dialog focus enters, remains inside, and returns to the invoker.

### 7B. Reliability, security, and performance audit

Deliverables:

- Friendly Network, AI, Database, Authentication, Validation, Not Found, and Unauthorized handling.
- RLS/ownership audit, URL validation, plain-text rendering, secret scan, and duplicate-submit review.
- Query and loading-state review.

Acceptance criteria:

- Simulated failures never expose a stack trace or secret to the UI.
- Cross-user tests pass for every domain table and mutation.
- User-entered script-like text is displayed as text and does not execute.
- Core pages show a loading state and avoid request-per-row query patterns.
- Repeated action clicks do not create duplicate applications or generations.

### 7C. Core automated and manual workflow verification

Deliverables:

- Playwright coverage of the complete MVP path.
- Manual test checklist for desktop and mobile.

Acceptance criteria:

- The following automated path passes: sign up → onboarding → add/analyze job → review/save → view detail → change status → generate match → generate/edit cover letter → view interview prep → logout/login → verify persistence.
- A separate two-user path proves isolation.
- Archive/restore, delete cancellation, AI failure fallback, and Demo Mode paths pass.
- Browser console has no unexplained errors during the core flow.

### 7D. Documentation and public deployment

Deliverables:

- README covering prerequisites, local setup, environment variables, migrations, seed, tests, AI modes, and deployment.
- Production migrations and environment configuration.
- Public Vercel deployment backed by a production Supabase project.
- Production smoke test record.

Acceptance criteria:

- A new developer can follow README instructions to run the project from a clean checkout.
- No-key local and production configurations complete the Demo workflow.
- The public URL loads over HTTPS and protected routes enforce authentication.
- Production smoke testing completes the core flow without visible console errors.
- No production secret is committed or exposed to the client.

Phase 7 exit criterion: all Definition of Done items in the PRD are demonstrably satisfied, including public deployment, responsive behavior, persistence, user isolation, Demo Mode, documentation, and manual core-flow verification.

## 9. Scope guardrails

The implementation stops at the MVP described above. It will not include:

- LinkedIn or WaterlooWorks automatic applications.
- Automatic scraping of job sites.
- Browser extensions.
- Gmail reading or automated email sending.
- Calendar integrations.
- Resume PDF editing.
- Team collaboration or recruiter/company accounts.
- Subscriptions or payments.
- Native mobile applications.
- Public social profiles.
- Automatic reference checking.
- Automatic submission of applications to employers.

Any later request that touches these areas should be treated as a separate post-MVP decision and must not delay completion of this plan.

## 10. Phase completion evidence

At the end of each phase, the implementation report should include:

1. Completed acceptance criteria with links to relevant files/tests.
2. Commands run and their results.
3. Database migrations introduced.
4. Screens or routes manually checked at mobile and desktop sizes where applicable.
5. Known limitations that remain within later planned phases.
6. Confirmation that no out-of-scope feature was added.
