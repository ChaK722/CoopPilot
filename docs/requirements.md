# CoopPilot Product Requirements

> **Status:** This document is the product source of truth for the CoopPilot MVP. It was synthesized from `docs/architecture.md`, `docs/database-schema.md`, and `docs/implementation-plan.md` on 2026-08-01. Where those documents reference an external CoopPilot PRD that is not present in the workspace, this document supersedes that reference. Ambiguous or conflicting points are recorded in Appendix A and must be confirmed before implementation proceeds.

## 1. Product overview and target users

### 1.1 Product overview

CoopPilot is a single-user-per-account job application companion for co-op and internship job seekers. It helps one user:

- Maintain a structured profile: education, skills, experience, projects, and job-search preferences.
- Extract structured data from a job posting description with optional URL.
- Track every application through a seven-stage lifecycle: Saved, Preparing, Applied, Interview, Offer, Rejected, Withdrawn.
- See applications on a Kanban-style board and in a searchable, filterable table.
- Analyze resume–job match with an evidence-backed five-part score.
- Generate cover letters and interview preparation materials.
- Monitor progress with a dashboard and detailed analytics.
- Do all of the above with or without an external AI API key (Demo Mode).

The MVP is deliberately personal: one user per account, no teams, no recruiter or company accounts, and no automatic application submission.

### 1.2 Target users

- Primary: co-op and internship students managing several concurrent applications, including postings seen on platforms such as WaterlooWorks.
- Secondary: any individual job seeker who wants structured tracking and AI-assisted preparation.
- Users are treated as non-technical: every workflow must be usable without drag-and-drop, and AI modes must be self-explanatory and clearly labeled.

### 1.3 Product principles

1. **Persistent and owned data.** All user data lives in PostgreSQL; only the owning user can access it, at both the database and application layers.
2. **Demo first.** The complete core workflow works without any external AI key.
3. **AI is assistive, not authoritative.** Every AI output is reviewable, editable, validated, traceable to real user facts, and labeled with its generation mode.
4. **Mobile usable.** No feature depends on drag-and-drop; keyboard and touch alternatives exist for every core interaction.

## 2. Core user journey

Primary happy path:

1. Register with email and password.
2. Complete onboarding (basic information and preferences; education, skills, experience, and projects can be completed now or later).
3. Add a job by pasting a non-empty description and an optional URL; review the extracted draft; correct any fields; save.
4. Find the application in the Saved column of the board; move it through statuses as the search progresses.
5. Generate a match analysis; review the score, matching/missing skills, evidence, and suggestions.
6. Generate and edit a cover letter; generate interview preparation (behavioural questions, technical questions, research checklist).
7. Track deadlines and monitor progress on the dashboard and analytics pages; archive finished applications; restore or permanently delete as needed.
8. Log out and log back in later: all data persists.

Alternative paths that must also work:

- Manual entry when AI extraction fails, is skipped, or is not desired.
- Job tracking without a completed profile (profile completion is required only for profile-dependent AI features; see Appendix A, O-2).
- Exploring the application through a seeded demo account.

## 3. MVP goals

| Goal                         | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| G1 Persistent tracking       | All profile and application data survives refresh, logout/login, and redeployment via PostgreSQL. |
| G2 User isolation            | No user can read or mutate another user's data at the database (RLS) or application layer.        |
| G3 No-key usability          | The full core workflow is usable in Demo Mode without an external AI API key.                     |
| G4 Complete lifecycle        | All seven statuses, status history, deadlines, archive/restore, and permanent delete work.        |
| G5 Trustworthy AI            | Outputs are structured, validated, evidence-based, versioned, and never invent user facts.        |
| G6 Responsive and accessible | Usable on phone, tablet, and desktop; completeable with a keyboard; WCAG-conscious.               |
| G7 Deployable                | Production deployment on managed hosting with migration-driven PostgreSQL.                        |

## 4. Functional requirements

The functional requirements are organized by module. The master list is:

| ID    | Area                                                       | Detail section |
| ----- | ---------------------------------------------------------- | -------------- |
| FR-1  | Authentication and user-data isolation                     | 5              |
| FR-2  | User profile management                                    | 6              |
| FR-3  | Job posting extraction                                     | 7              |
| FR-4  | Application tracking, table, board, deadlines, archive     | 8              |
| FR-5  | Resume–job match analysis                                  | 9              |
| FR-6  | Cover letter generation                                    | 10             |
| FR-7  | Interview preparation                                      | 11             |
| FR-8  | Dashboard and analytics                                    | 12             |
| FR-9  | PostgreSQL persistence                                     | 13             |
| FR-10 | Demo Mode                                                  | 14             |
| FR-11 | Responsive design, accessibility, security, error handling | 15             |

## 5. Authentication and user-data isolation

### 5.1 Authentication

- **AUTH-1** Users register and log in with email and password; sessions persist across refreshes and log out cleanly.
- **AUTH-2** Unauthenticated requests to any protected page redirect to Login. Protected pages and every mutation also verify the server session; middleware alone is not an authorization boundary.
- **AUTH-3** Invalid credentials produce a clear, non-technical error message.
- **AUTH-4** The authentication email is the canonical identity. The profile displays it and never maintains a second mutable email copy.
- **AUTH-5** A seeded demo account exists so the application can be explored without creating a profile. The demo account is created by a server-side seed script; administrative credentials are never shipped to the browser.
- **AUTH-6** Out of scope for the MVP: password reset, social login, MFA, enterprise SSO, and organization accounts.

### 5.2 User-data isolation

- **ISO-1** Every user-owned table stores `user_id`, even when ownership could be inferred through a parent.
- **ISO-2** Row Level Security is enabled on every user-owned table. Policies allow a user to select, insert, update, or delete only rows where `user_id = auth.uid()`.
- **ISO-3** Child-table policies also verify that the referenced parent application belongs to the same user, preventing cross-user child-row insertion.
- **ISO-4** Server services still filter by the current user ID and return Not Found for resources the user does not own.
- **ISO-5** Automated two-user tests (direct database access under RLS and application-layer mutations) prove user A cannot read, update, or delete user B's data for every domain table.

## 6. User profile requirements

- **PRO-1** Onboarding collects basic information: preferred name, phone (optional), location (optional), LinkedIn/GitHub/website URLs (optional, HTTP/HTTPS only).
- **PRO-2** Onboarding collects preferences: preferred locations, remote preference, preferred work term lengths, target roles, and available start date.
- **PRO-3** Required onboarding fields block completion until valid. The required set is `preferred_name` only; every other field (location, education, skills, experience, projects, target roles, work-term preferences, and preferred locations) is optional and may be completed later from `/profile`. An empty or whitespace-only `preferred_name` is invalid, enforced on both client and server.
- **PRO-4** Education is managed as a list: school, degree, program, optional start and expected graduation dates, optional relevant coursework, and manual reordering.
- **PRO-5** Skills are managed by category: programming languages, frameworks, cloud platforms, tools, concepts, and spoken languages. Adding a skill twice in the same category with the same normalized name creates only one record. Add/remove must be keyboard-usable, and persisted skills reload in their correct categories.
- **PRO-6** Experience is managed as a list: title, organization, optional location, optional start/end dates (end cannot precede start), optional description and bullet points, and manual reordering.
- **PRO-7** Projects are managed as a list: name, technologies, optional dates (end cannot precede start), optional description and bullet points, optional GitHub URL and demo URL (HTTP/HTTPS only), and manual reordering.
- **PRO-8** URL and date validation run on both client and server. Explicit save actions show save state and protect against leaving with unsaved changes.
- **PRO-9** Saved profile data survives refresh, logout, and login. Server tests reject any attempt to update another user's profile records.

## 7. Job posting extraction requirements

- **EXT-1** Input is a non-empty description plus an optional URL.
- **EXT-2** Extraction runs server-side through an AI provider interface, and the provider output is schema-validated before anything is persisted.
- **EXT-3** Unknown extracted values remain `null`, `Unknown`, or empty arrays; nothing is inferred from silence. Dates are normalized only when the source provides a date; skills are deduplicated without inventing related skills.
- **EXT-4** The user reviews an editable draft containing every extracted field and can correct any value before saving.
- **EXT-5** A manual entry path is always available when analysis fails or is skipped. AI errors never block manual job creation or editing.
- **EXT-6** Analysis does not create an application; retrying analysis can never create duplicate applications.
- **EXT-7** The reviewed form is protected against duplicate submission: double-submitting creates exactly one application.
- **EXT-8** Repeated Analyze clicks while a request is running produce only one active request.
- **EXT-9** Extracted and stored job fields: company, job title, location, country, work arrangement, employment type, work term duration, deadline (calendar date), salary text (preserves source wording without inference), education requirements, years of experience (preserves raw values such as `2+ years`), posting URL, responsibilities, and qualifications. The complete original description is always preserved.

## 8. Application tracking and Kanban requirements

### 8.1 Status lifecycle

- **TRK-1** The application status set is exactly: `saved`, `preparing`, `applied`, `interview`, `offer`, `rejected`, `withdrawn`.
- **TRK-2** Changing status is transactional: the current status is updated and a status event is appended. The initial event records `from_status = null`. Status history is mandatory because funnel rates depend on whether an application ever reached a stage.
- **TRK-3** `date_applied` may remain null when a record is moved to Applied; the UI shows an optional date prompt (enter a date, Skip to keep null, or Cancel the move) but never invents a date (see Appendix A, O-11). An existing `date_applied` is preserved when leaving Applied or re-entering it.

### 8.2 Board

- **TRK-4** The board shows seven columns, one per status, and includes only non-archived applications. Each application appears in exactly one column.
- **TRK-5** Cards show company, job title, location, deadline, latest match score (when one exists; omitted entirely when none exists, see Appendix A, O-7), date applied, and textual status. Column counts match rendered cards; empty columns have usable empty states; cards link to the Job Detail page of the owning user only.
- **TRK-6** Drag-and-drop is available on supported layouts, with a status selector on mobile and an accessible alternative everywhere. Status changes use optimistic UI with rollback and an announced error on failure.

### 8.3 Table, search, filter, sort

- **TRK-7** A responsive table/card view lists applications.
- **TRK-8** Search covers company, job title, notes, and skills, backed by database queries of user-owned rows.
- **TRK-9** Filters: status, company, location, work arrangement, required skill, deadline, and archive state. Combined filters behave as an intersection and can be reset. Archived records are hidden by default.
- **TRK-10** Sorting covers the fields surfaced in the table; the exact field list is to be confirmed (Appendix A, O-3).
- **TRK-11** Mobile users can inspect every displayed field without controls leaving the viewport.

### 8.4 Job detail, notes, lifecycle actions

- **TRK-12** Job Detail includes header, overview, requirements, notes, interview-date sections, and generated-content sections.
- **TRK-13** Notes use debounced autosave with `Saving`, `Saved`, and `Could not save` indicators; a failed save never reports success.
- **TRK-14** Users can edit, duplicate, archive, restore, and permanently delete an application. Duplicate creates a new record with a new ID and fresh status history (copied field set to be confirmed, Appendix A, O-5). Delete requires confirmation, removes dependent records via cascade, and cancelling leaves data intact.

### 8.5 Deadlines and archive

- **TRK-15** Upcoming deadlines are surfaced as reminders; the reminder window is today through today+7 calendar days, inclusive (Appendix A, O-6).
- **TRK-16** Expired Saved/Preparing applications show an unapplied warning; applied-stage records do not receive the unapplied warning. Deadline states are derived from the stored calendar date (expired = deadline < today) and covered by boundary-date tests.
- **TRK-17** Archiving sets `archived_at`; archived applications disappear from the board, table, and dashboard immediately and are shown only on the Archive page. Restore returns them to their prior status.

## 9. Resume–job match analysis

- **MAT-1** Match analysis produces an overall score from 0 to 100 and a fixed five-part breakdown: required skills (maximum weight 40), preferred skills (maximum weight 20), relevant experience (maximum weight 20), education (maximum weight 10), and location and availability (maximum weight 10). The overall score equals the sum of the awarded component values.
- **MAT-2** Output includes matching skills, missing required skills and missing preferred skills (displayed separately), matching experience referencing stored experiences, relevant projects referencing stored projects, keywords, and suggestions. Every claim carries evidence references to stored profile or job fields.
- **MAT-3** A skill absent from the profile is never shown as possessed by the user.
- **MAT-4** Suggestions never recommend fabricating experience.
- **MAT-5** Each generation is an immutable snapshot with generation time and mode (`demo` or `external`). Regeneration creates a new snapshot and never overwrites the prior one.
- **MAT-6** Source hashes detect profile or job changes after generation; editing either marks the prior result stale, and regeneration is the refresh path.
- **MAT-7** Malformed provider output is rejected before persistence, and a provider failure does not break manual use.

## 10. Cover letter generation

- **CL-1** Users can generate, regenerate, edit, copy, save, and restore previous versions of a cover letter.
- **CL-2** Generated output targets the stored company and role and is approximately 250–400 words when sufficient source material exists.
- **CL-3** Every claimed experience or project can be traced to the current user's profile.
- **CL-4** A pre-generation sufficiency check runs before generation. Insufficient profile data produces an actionable prompt to complete the profile rather than invented content.
- **CL-5** Documents are versioned: editing or regenerating inserts a new version and never deletes the prior version. A user-edited document is never overwritten silently; regeneration shows a warning when an edited version exists.
- **CL-6** Restore returns the selected prior content and persists it as the current revision. Copy provides explicit success or failure feedback.
- **CL-7** The generation mode (`demo` or `external`) and generated time are displayed with the result.

## 11. Interview preparation

- **INT-1** Interview preparation generates three content types: behavioural questions, technical questions, and a research checklist.
- **INT-2** Each question includes why it may be asked, relevant real experience, and an optional outline.
- **INT-3** Technical questions are tied to stored job skills.
- **INT-4** Suggested personal examples reference only stored experience or projects; when no relevant example exists, the output states that none is available.
- **INT-5** The system never generates fabricated complete personal answers; it provides outlines.
- **INT-6** Each content type persists and reloads from Job Detail. Regeneration preserves prior versions, and the generation mode is displayed.

## 12. Dashboard and analytics

- **DASH-1** Summary cards show totals, active applications, interviews, offers, upcoming deadlines, interview rate, and offer rate.
- **DASH-2** Metrics use these definitions:
  - Saved and Preparing never enter the applied denominator.
  - The applied denominator includes applications that ever reached Applied, Interview, Offer, Rejected, or Withdrawn, based on status history.
  - Interview rate = applications that ever reached Interview divided by applied applications.
  - Offer rate = applications that ever reached Offer divided by applied applications.
  - Archived applications are excluded from main metrics.
- **DASH-3** Charts: applications by status, applications submitted over time (semantics for missing `date_applied` to be confirmed, Appendix A, O-12), and most requested skills.
- **DASH-4** Action lists: upcoming deadlines, recently updated applications, and applications requiring action (rule set to be confirmed, Appendix A, O-4).
- **DASH-5** Charts include accessible titles, values, and text alternatives. No-data states show an appropriate action rather than fake values. Ordering is deterministic.
- **DASH-6** Every dashboard and analytics value is reproducible from persisted application data, reconciles with table records and summary cards for fixed seed data, and uses bounded aggregate queries rather than one query per card.

## 13. PostgreSQL persistence requirements

- **DB-1** PostgreSQL (managed Supabase PostgreSQL) is the sole primary database. `localStorage` is never used as the primary database; it may store only ephemeral, non-authoritative UI preferences such as theme choice.
- **DB-2** Schema changes are migration-driven, committed, and repeatable; production is never modified manually as part of normal deployment.
- **DB-3** Conventions: UUID primary keys; `timestamptz` timestamps defaulting to the database clock; application deadlines stored as calendar `date`; `user_id` on every user-owned table; RLS enabled on every user-owned table; an `updated_at` trigger on mutable records; user prose stored and rendered as plain text (no trusted HTML); skill matching via normalized lowercase keys that preserve display names.
- **DB-4** The following operations are transactional: creating an application with its skills and initial status event; updating status and appending the status event; duplicating an application; permanently deleting an application with its dependent records; saving a new generated-document version with the next valid version number.
- **DB-5** Idempotency: duplicate application submission is prevented by a unique `(user_id, creation_key)`; duplicate AI work is prevented by a unique `(user_id, operation, idempotency_key)` AI-run constraint.
- **DB-6** Indexes support board/table queries, upcoming deadlines, recent activity, company sorting, submission analytics, required-skill filtering, status-history funnel calculations, interview scheduling, latest match results, and current/previous document versions (per the database schema document).
- **DB-7** Full-text search covers company, job title, notes, and skills. The MVP starts with a safe indexed database query; a generated `tsvector` is added only if profiling shows it is needed at MVP scale.
- **DB-8** Archived records keep `archived_at` set; main queries exclude them. Permanent delete cascades to owned dependent rows after confirmation.

## 14. Demo Mode when no AI API key is configured

- **DEMO-1** The provider is selected on the server: if external AI configuration is valid, the external provider is used; if the key is absent, `DemoAIProvider` is used automatically. The browser cannot choose an unconfigured provider or supply a secret key. There is no user-facing provider toggle in the MVP (see Appendix A, O-10).
- **DEMO-2** All four AI operations work in Demo Mode: job extraction, match analysis, cover letter generation, and interview preparation.
- **DEMO-3** Demo Mode is deterministic: identical input produces identical output, which makes the mode testable.
- **DEMO-4** Demo extraction returns a fixed, reasonable structured example while preserving the submitted URL and the complete original description; the user edits fields before saving (see Appendix A, O-9).
- **DEMO-5** Demo match analysis is deterministic and uses only profile and job facts supplied by the user.
- **DEMO-6** Demo cover letters use a deterministic template and only real profile facts; insufficient profile data produces a prompt to complete the profile rather than invented experience.
- **DEMO-7** Demo interview preparation is generated deterministically from stored job skills and user experience.
- **DEMO-8** Every Demo result visibly displays `Demo AI Response`. The generation mode is persisted and displayed alongside results.

## 15. Responsive design, accessibility, security, and error handling

### 15.1 Responsive design

- **RESP-1** All pages render at 375px, tablet, and desktop widths without horizontal overflow.
- **RESP-2** The sidebar collapses into a labelled mobile navigation control.
- **RESP-3** Tables use responsive cards or intentional horizontal scrolling on mobile.
- **RESP-4** Kanban includes a status selector on mobile so drag-and-drop is optional.

### 15.2 Accessibility

- **A11Y-1** Every input has a programmatic label and associated error text.
- **A11Y-2** Main actions are keyboard reachable with visible focus; all core workflows can be completed using a keyboard.
- **A11Y-3** Status is never conveyed by color alone; text or an icon accompanies color.
- **A11Y-4** Charts include titles, values, and text summaries.
- **A11Y-5** Confirmation dialogs trap focus and return it to the invoking control.
- **A11Y-6** Light and dark themes share readable contrast and consistent semantic colors; theme choice persists across refreshes.
- **A11Y-7** Automated accessibility checks report no serious violations on core pages.

### 15.3 Security

- **SEC-1** No AI API key, database service-role key, or another user's data ever reaches the browser. Secrets are server-only environment variables.
- **SEC-2** Ownership is enforced twice: RLS in the database and application-level ownership checks in server services.
- **SEC-3** User-entered script-like text is stored and rendered as plain text so it cannot execute.
- **SEC-4** URLs are validated (HTTP/HTTPS) on client and server.
- **SEC-5** Duplicate submissions are prevented for application creation and AI generation.
- **SEC-6** Preview deployments must not share production seed credentials, and no secret or local environment file is tracked.

### 15.4 Error handling

- **ERR-1** A small application error taxonomy is used: validation, unauthenticated, unauthorized/not found, conflict, AI unavailable, database unavailable, and unexpected.
- **ERR-2** Errors returned to the browser contain a safe message and a correlation ID, never a stack trace or secret.
- **ERR-3** Forms associate validation errors with their fields; loading controls disable duplicate submission.
- **ERR-4** Every completed UI includes loading, empty, success, and recoverable error states.
- **ERR-5** Kanban mutations use optimistic state only when a previous state is available for rollback; on failure the UI restores the prior state and announces the error.

## 16. Explicit out-of-scope features

The following are excluded from the MVP and must not be implemented:

- Automatic job applications (LinkedIn, WaterlooWorks, or any employer).
- Automatic scraping of job sites.
- Browser extensions.
- Gmail reading or automated email sending.
- Calendar integrations.
- Resume PDF editing.
- Team collaboration, recruiter/company accounts, and public social profiles.
- Subscriptions or payments.
- Native mobile applications.
- Automatic reference checking.
- Automatic submission of applications to employers.
- Password reset, social login, MFA, enterprise SSO, and organization accounts.
- Rich-text content (user content is plain text).

Any later request touching these areas is a separate post-MVP decision and must not delay completion of the MVP.

## 17. Acceptance criteria

- **AC-1** A user can register, log in, complete onboarding, add a job with analysis, review and save it, and see it persist after refresh and after logging back in.
- **AC-2** Two-user automated tests prove isolation at the RLS and application layers for every domain table and mutation.
- **AC-3** With no external AI key, all four AI operations complete in Demo Mode, are deterministic for identical inputs, and are visibly labeled.
- **AC-4** All seven statuses can be selected on desktop and mobile without drag-and-drop; each real status change creates exactly one history event, and simulated failures roll back cleanly.
- **AC-5** Match scores sum to the displayed overall score and respect component weights; the user is never shown possessing an unowned skill, and suggestions never advise fabricating experience.
- **AC-6** Cover letters are approximately 250–400 words with traceable claims; editing and regeneration never delete prior versions, and restore returns the selected prior content.
- **AC-7** Interview preparation questions are tied to stored job skills and stored experience, and no fabricated complete personal answers are generated.
- **AC-8** Dashboard and analytics values reconcile with persisted data for fixed seed data, behave correctly with zero records, and exclude archived applications per the definitions in section 12.
- **AC-9** All core workflows are keyboard-complete at 375px and above; automated accessibility checks report no serious violations; simulated failures never expose a stack trace or secret.
- **AC-10** The automated end-to-end path passes: sign up → onboarding → add/analyze job → review/save → view detail → change status → generate match → generate/edit cover letter → view interview prep → logout/login → verify persistence. A separate two-user path proves isolation, and archive/restore, delete cancellation, AI-failure fallback, and Demo Mode paths pass.
- **AC-11** A new developer can run the project from a clean checkout; no-key local and production Demo workflows complete; the public URL loads over HTTPS; protected routes enforce authentication; no secret is committed or exposed to the client.

## 18. Definition of Done

### Per increment or feature

1. All acceptance criteria for the increment pass, with automated tests where applicable.
2. User ownership is verified for every new read and mutation, including RLS tests where applicable.
3. Database migrations are committed and repeatable; no manual production schema edits.
4. Loading, empty, success, and recoverable error states exist for completed UI; no primary button is connected to a placeholder action.
5. The feature works without an external AI key, and Demo Mode labels are correct.
6. The feature is responsive at phone, tablet, and desktop widths and is keyboard-accessible, with no serious automated accessibility violations.
7. No out-of-scope feature was added; no secret was committed; script-like user input is rendered as text.
8. Documentation is updated as needed (for example, README, environment-variable examples with names but no secrets).

### MVP complete

1. Responsive and accessibility audit passed across all public and authenticated routes.
2. Reliability, security, and performance audit passed: cross-user tests for every domain table, URL validation, plain-text rendering, secret scan, duplicate-submit review, and query/loading-state review.
3. The automated Playwright core path and two-user isolation path pass with no unexplained browser console errors.
4. Public deployment is live on HTTPS with a production Supabase project, backed by committed migrations and server-only environment configuration.
5. Production smoke testing completes the core flow, including the no-key Demo workflow, without visible console errors.
6. All Definition of Done items above are demonstrably satisfied and recorded in the phase completion evidence.

## Appendix A: Open questions and decisions to confirm

These points are ambiguous, missing, or conflicting across the three source documents. They are recorded here rather than resolved, per the review instructions.

| ID   | Item                                                                                                                                                                                                                                | Status in the source documents                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1  | The original CoopPilot PRD referenced by architecture.md and implementation-plan.md is not present in the workspace. Completeness of this document against that PRD cannot be verified.                                             | External PRD missing                                                                                                                                                                                                                                        |
| O-2  | Is onboarding required before any usage, or only before profile-dependent AI features (match, cover letter, interview prep)? The plan's empty Dashboard offers a path to Add Job without onboarding, implying tracking works first. | Ambiguous                                                                                                                                                                                                                                                   |
| O-3  | The exact sortable field list for the applications table is not enumerated anywhere ("all PRD-specified fields").                                                                                                                   | Missing                                                                                                                                                                                                                                                     |
| O-4  | The dashboard's "applications requiring action" list has no defined rule set.                                                                                                                                                       | Missing                                                                                                                                                                                                                                                     |
| O-5  | The set of fields copied when duplicating an application is not specified ("only intended job fields/skills").                                                                                                                      | Missing                                                                                                                                                                                                                                                     |
| O-6  | The "upcoming deadline" reminder window (for example, number of days) is not defined.                                                                                                                                               | **Resolved 2026-08-02:** today through today+7 calendar days, inclusive; expired = deadline < today using the stored calendar date.                                                                                                                         |
| O-7  | Kanban card behavior for "latest match score" when no match analysis exists (placeholder vs. omit) is not specified.                                                                                                                | **Resolved 2026-08-02:** the field is omitted entirely when no match analysis exists; no placeholder or fabricated score.                                                                                                                                   |
| O-8  | The Dashboard "interviews" and "offers" summary cards are not defined as count of applications ever reaching the stage versus count of interview events.                                                                            | Ambiguous                                                                                                                                                                                                                                                   |
| O-9  | Demo extraction returns a "fixed, reasonable structured example" while preserving the description and URL; whether the example is literally identical for every job (requiring user edits) should be confirmed.                     | Ambiguous                                                                                                                                                                                                                                                   |
| O-10 | Demo Mode is an automatic server-side fallback with no user-facing toggle; this product-visible decision should be confirmed.                                                                                                       | Consistent, but unconfirmed as product intent                                                                                                                                                                                                               |
| O-11 | The exact prompt behavior and timing for `date_applied` when moving a record to Applied is not detailed in the implementation plan.                                                                                                 | **Resolved 2026-08-02:** first move to Applied with a null `date_applied` shows an optional prompt (enter date / Skip / Cancel); the chosen date commits in the same transaction as the status change; existing values are preserved and never auto-filled. |
| O-12 | The "applications submitted over time" chart semantics for applications with a null `date_applied` are not defined.                                                                                                                 | Missing                                                                                                                                                                                                                                                     |
| O-13 | The schema marks only `preferred_name` as required after onboarding, while the plan refers to "required onboarding fields" in the plural.                                                                                           | **Resolved 2026-08-02:** `preferred_name` is the only required onboarding field; all other profile fields are optional and may be completed later from `/profile`. Client and server enforce non-empty (trimmed) `preferred_name`.                          |
