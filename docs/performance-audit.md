# Performance audit

Audit date: 2026-08-02.

## Query counts (service-layer tests in `tests/query-counts.test.ts`)

| Page/load         | Queries                                                                  | Proof        |
| ----------------- | ------------------------------------------------------------------------ | ------------ |
| Dashboard         | 1 analytics RPC                                                          | service test |
| Analytics         | 1 analytics RPC (same service)                                           | service test |
| Board             | 1 applications query + 1 batch match-score RPC (no per-card queries)     | service test |
| Applications list | 1 bounded query; search/required-skill add exactly one parameterized RPC | service test |
| Job Detail        | 4 parallel bounded queries (application, skills, events, interviews)     | service test |
| Profile           | 5 parallel bounded queries (profile + 4 child lists)                     | service test |

All list queries carry explicit `limit`; analytics lists are capped in SQL
(5/5/5/10).

## EXPLAIN / index audit

`tests/explain-plan.test.ts` verifies the designed indexes exist and that
the core queries produce valid plans (recorded below). No duplicate or
unused indexes were added; the only Phase 7 index work was the Phase 6
`application_status_events_user_to_changed_idx` for funnel/earliest-event
lookups.

Indexes used by core queries:

- `applications_owner_status_idx (user_id, archived_at, status)` — board,
  status counts, active totals.
- `applications_owner_deadline_idx (user_id, deadline)` — upcoming/action
  windows.
- `applications_owner_updated_idx (user_id, updated_at desc)` — recently
  updated.
- `applications_owner_date_applied_idx (user_id, date_applied)` — submission
  analytics.
- `application_skills_owner_normalized_idx
(user_id, normalized_name, requirement_type)` — skill aggregation and
  required-skill filters.
- `application_status_events_user_to_changed_idx
(user_id, to_status, changed_at)` — funnel reach and earliest applied-stage
  events.
- `match_analyses_application_generated_idx (application_id, generated_at
desc)` — latest match per application (the board RPC adds the `id`
  tie-breaker in the sort).
- `generated_documents_application_type_version_idx
(application_id, document_type, version desc)` — current/previous document
  versions.

Representative plans (captured by the test suite on embedded PostgreSQL):

- Board: index scan on `applications_owner_updated_idx` with filter
  `(user_id = ... AND archived_at IS NULL)`, then a batch
  `distinct on (application_id)` match read using
  `match_analyses_application_generated_idx`.
- Analytics base set: index scan on `applications_owner_status_idx`.
- Upcoming deadlines: index scan on `applications_owner_deadline_idx` with
  status filter applied to the row set.
- Funnel: index scan on `application_status_events_user_to_changed_idx` for
  `(user_id, to_status)` with deterministic ordering.
- Document versions: index scan on
  `generated_documents_application_type_version_idx` for the max version.

## Client/architecture

- No client component queries Supabase directly; all reads go through server
  services/RPCs.
- Supabase clients are created once per request (server) or per action
  (browser); no duplicated bundle loads on page loaders.
- Loading skeletons mirror final layouts (dashboard/analytics/settings/
  board) to avoid layout shift.

## AI documents

- Generated documents and match analyses are bounded (`LIST_LIMIT = 200`
  per child list) and versioned; the latest versions are selected server-side
  with deterministic ordering.
