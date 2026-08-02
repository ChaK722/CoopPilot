-- CoopPilot Phase 1 baseline.
-- Conventions: UUID primary keys, timestamptz with database clock defaults,
-- user-owned tables carry user_id and have Row Level Security enabled.

-- The auth.uid() function ships with hosted Supabase and tinbase. Define a
-- compatible fallback for plain PostgreSQL so migrations and RLS tests run
-- against any Postgres-compatible engine.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;

-- Supabase uses an `authenticated` database role for requests carrying a user
-- session. Create it if the engine has not already.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

-- One profile row per authenticated user.
create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  preferred_name text,
  phone text,
  location text,
  linkedin_url text,
  github_url text,
  website_url text,
  preferred_locations text[] not null default '{}',
  remote_preference text,
  preferred_work_term_lengths text[] not null default '{}',
  target_roles text[] not null default '{}',
  available_start_date date,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_preferred_name_not_blank check (
    preferred_name is null or length(trim(preferred_name)) > 0
  )
);

comment on table public.user_profiles is
  'One profile row per user; created automatically on sign-up.';

-- Row Level Security: every user can manage only their own profile row.
alter table public.user_profiles enable row level security;

create policy "profiles select own"
  on public.user_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "profiles insert own"
  on public.user_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "profiles update own"
  on public.user_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profiles delete own"
  on public.user_profiles
  for delete
  to authenticated
  using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_profiles to authenticated;

-- Maintain updated_at on mutable records.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row
  execute function public.set_updated_at();

-- Create a profile row for every new authenticated user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

grant execute on function public.handle_new_user() to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Core query indexes planned for Phase 1 baseline.
create index user_profiles_user_id_idx on public.user_profiles (user_id);
