-- CoopPilot Phase 2: education, profile skills, experience, and projects.
-- Follows the Phase 1 conventions: UUID PKs, user_id references auth.users,
-- RLS enabled with own-row policies on every user-owned table, updated_at
-- maintained by public.set_updated_at() (created in Phase 1).

-- ---------------------------------------------------------------------------
-- educations
-- ---------------------------------------------------------------------------
create table public.educations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school text not null,
  degree text not null,
  program text not null,
  start_date date,
  expected_graduation_date date,
  relevant_coursework text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint educations_school_not_blank check (length(trim(school)) > 0),
  constraint educations_degree_not_blank check (length(trim(degree)) > 0),
  constraint educations_program_not_blank check (length(trim(program)) > 0),
  constraint educations_sort_order_nonnegative check (sort_order >= 0),
  constraint educations_graduation_after_start check (
    start_date is null or expected_graduation_date is null
    or expected_graduation_date >= start_date
  )
);

alter table public.educations enable row level security;

create policy "educations select own" on public.educations
  for select to authenticated
  using (user_id = auth.uid());
create policy "educations insert own" on public.educations
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "educations update own" on public.educations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "educations delete own" on public.educations
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.educations to authenticated;

create trigger educations_set_updated_at
  before update on public.educations
  for each row
  execute function public.set_updated_at();

create index educations_owner_order_idx on public.educations (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- profile_skills
-- ---------------------------------------------------------------------------
create table public.profile_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  constraint profile_skills_category_valid check (
    category in (
      'programming_languages',
      'frameworks',
      'cloud_platforms',
      'tools',
      'concepts',
      'spoken_languages'
    )
  ),
  constraint profile_skills_name_not_blank check (length(trim(name)) > 0),
  constraint profile_skills_normalized_not_blank check (length(trim(normalized_name)) > 0),
  constraint profile_skills_unique_per_category unique (user_id, category, normalized_name)
);

alter table public.profile_skills enable row level security;

create policy "profile_skills select own" on public.profile_skills
  for select to authenticated
  using (user_id = auth.uid());
create policy "profile_skills insert own" on public.profile_skills
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "profile_skills update own" on public.profile_skills
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "profile_skills delete own" on public.profile_skills
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.profile_skills to authenticated;

create index profile_skills_owner_category_idx on public.profile_skills (user_id, category);

-- Transactional full-skill-set replacement used by the skills editor.
-- The function is security definer (it deletes rows regardless of RLS), so it
-- verifies the caller may only touch their own skill set.
create or replace function public.replace_profile_skills(
  p_user_id uuid,
  p_skills jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  delete from public.profile_skills
  where user_id = p_user_id;

  insert into public.profile_skills (user_id, category, name, normalized_name)
  select
    p_user_id,
    (skill ->> 'category')::text,
    (skill ->> 'name')::text,
    (skill ->> 'normalized_name')::text
  from jsonb_array_elements(p_skills) as skill
  where (skill ->> 'name') is not null
    and length(trim((skill ->> 'name')::text)) > 0
    and (skill ->> 'normalized_name') is not null;
end;
$$;

grant execute on function public.replace_profile_skills(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- experiences
-- ---------------------------------------------------------------------------
create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  organization text not null,
  location text,
  start_date date,
  end_date date,
  description text,
  bullet_points text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiences_title_not_blank check (length(trim(title)) > 0),
  constraint experiences_organization_not_blank check (length(trim(organization)) > 0),
  constraint experiences_sort_order_nonnegative check (sort_order >= 0),
  constraint experiences_end_after_start check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

alter table public.experiences enable row level security;

create policy "experiences select own" on public.experiences
  for select to authenticated
  using (user_id = auth.uid());
create policy "experiences insert own" on public.experiences
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "experiences update own" on public.experiences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "experiences delete own" on public.experiences
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.experiences to authenticated;

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row
  execute function public.set_updated_at();

create index experiences_owner_order_idx on public.experiences (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  technologies text[] not null default '{}',
  start_date date,
  end_date date,
  description text,
  bullet_points text[] not null default '{}',
  github_url text,
  demo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_not_blank check (length(trim(name)) > 0),
  constraint projects_sort_order_nonnegative check (sort_order >= 0),
  constraint projects_end_after_start check (
    start_date is null or end_date is null or end_date >= start_date
  ),
  constraint projects_github_url_http check (
    github_url is null or github_url ~* '^https?://'
  ),
  constraint projects_demo_url_http check (
    demo_url is null or demo_url ~* '^https?://'
  )
);

alter table public.projects enable row level security;

create policy "projects select own" on public.projects
  for select to authenticated
  using (user_id = auth.uid());
create policy "projects insert own" on public.projects
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "projects update own" on public.projects
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "projects delete own" on public.projects
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.projects to authenticated;

create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

create index projects_owner_order_idx on public.projects (user_id, sort_order);
