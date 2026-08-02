-- Phase 1 follow-up migration: ownership-friendly lookup index and an RLS
-- sanity constraint that mirrors application-level URL validation.
-- The URL check is intentionally loose (HTTP/HTTPS only) because the
-- authoritative validation lives in the application layer (Zod).

create index user_profiles_owner_lookup_idx
  on public.user_profiles (user_id, created_at desc);

alter table public.user_profiles
  add constraint user_profiles_urls_http_or_https check (
    (linkedin_url is null or linkedin_url ~* '^https?://')
    and (github_url is null or github_url ~* '^https?://')
    and (website_url is null or website_url ~* '^https?://')
  );
