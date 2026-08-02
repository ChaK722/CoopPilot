-- CoopPilot Phase 3: applications, application skills, status history, and
-- interviews. Follows Phase 1/2 conventions: UUID PKs, user_id on every
-- row, RLS with own-row policies (child tables also verify the parent
-- application belongs to the caller), updated_at triggers, and transactional
-- RPCs for multi-table writes.

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creation_key uuid not null,
  company text not null,
  job_title text not null,
  location text,
  country text,
  work_arrangement text,
  employment_type text,
  work_term_duration text,
  deadline date,
  salary_text text,
  education_requirements text[] not null default '{}',
  years_of_experience text,
  posting_url text,
  original_description text not null,
  responsibilities text[] not null default '{}',
  qualifications text[] not null default '{}',
  status text not null default 'saved',
  date_applied date,
  notes text not null default '',
  contact_person text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_company_not_blank check (length(trim(company)) > 0),
  constraint applications_job_title_not_blank check (length(trim(job_title)) > 0),
  constraint applications_description_not_blank check (length(trim(original_description)) > 0),
  constraint applications_status_valid check (
    status in ('saved', 'preparing', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')
  ),
  constraint applications_posting_url_http check (
    posting_url is null or posting_url ~* '^https?://'
  ),
  constraint applications_creation_key_unique unique (user_id, creation_key)
);

alter table public.applications enable row level security;

create policy "applications select own" on public.applications
  for select to authenticated
  using (user_id = auth.uid());
create policy "applications insert own" on public.applications
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "applications update own" on public.applications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "applications delete own" on public.applications
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.applications to authenticated;

create trigger applications_set_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();

create index applications_owner_status_idx on public.applications (user_id, archived_at, status);
create index applications_owner_deadline_idx on public.applications (user_id, deadline);
create index applications_owner_updated_idx on public.applications (user_id, updated_at desc);
create index applications_owner_company_idx on public.applications (user_id, company);
create index applications_owner_date_applied_idx on public.applications (user_id, date_applied);

-- ---------------------------------------------------------------------------
-- application_skills
-- ---------------------------------------------------------------------------
create table public.application_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  requirement_type text not null,
  name text not null,
  normalized_name text not null,
  sort_order integer not null default 0,
  constraint application_skills_requirement_type_valid check (
    requirement_type in ('required', 'preferred')
  ),
  constraint application_skills_name_not_blank check (length(trim(name)) > 0),
  constraint application_skills_normalized_not_blank check (length(trim(normalized_name)) > 0),
  constraint application_skills_sort_order_nonnegative check (sort_order >= 0),
  constraint application_skills_unique_per_app unique (application_id, requirement_type, normalized_name)
);

alter table public.application_skills enable row level security;

create policy "application_skills select own" on public.application_skills
  for select to authenticated
  using (user_id = auth.uid());
create policy "application_skills insert own" on public.application_skills
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );
create policy "application_skills update own" on public.application_skills
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );
create policy "application_skills delete own" on public.application_skills
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.application_skills to authenticated;

create index application_skills_owner_normalized_idx
  on public.application_skills (user_id, normalized_name, requirement_type);
create index application_skills_application_idx on public.application_skills (application_id);

-- ---------------------------------------------------------------------------
-- application_status_events
-- ---------------------------------------------------------------------------
create table public.application_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  constraint application_status_events_from_valid check (
    from_status is null or from_status in (
      'saved', 'preparing', 'applied', 'interview', 'offer', 'rejected', 'withdrawn'
    )
  ),
  constraint application_status_events_to_valid check (
    to_status in ('saved', 'preparing', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')
  )
);

alter table public.application_status_events enable row level security;

create policy "application_status_events select own" on public.application_status_events
  for select to authenticated
  using (user_id = auth.uid());
create policy "application_status_events insert own" on public.application_status_events
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );
create policy "application_status_events update own" on public.application_status_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "application_status_events delete own" on public.application_status_events
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.application_status_events to authenticated;

create index application_status_events_application_idx
  on public.application_status_events (application_id, changed_at);
create index application_status_events_user_to_idx
  on public.application_status_events (user_id, to_status);

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  interview_type text not null,
  scheduled_at timestamptz not null,
  location_or_link text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interviews_type_not_blank check (length(trim(interview_type)) > 0)
);

alter table public.interviews enable row level security;

create policy "interviews select own" on public.interviews
  for select to authenticated
  using (user_id = auth.uid());
create policy "interviews insert own" on public.interviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );
create policy "interviews update own" on public.interviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "interviews delete own" on public.interviews
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.interviews to authenticated;

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row
  execute function public.set_updated_at();

create index interviews_application_scheduled_idx on public.interviews (application_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Transactional RPCs
-- ---------------------------------------------------------------------------

-- Creates an application, its skills, and the initial status event in one
-- transaction. Idempotent per (user_id, creation_key): a duplicate submit
-- with the same key returns the existing application id instead of creating
-- a second record.
create or replace function public.create_application(
  p_user_id uuid,
  p_creation_key uuid,
  p_company text,
  p_job_title text,
  p_location text,
  p_country text,
  p_work_arrangement text,
  p_employment_type text,
  p_work_term_duration text,
  p_deadline date,
  p_salary_text text,
  p_education_requirements text[],
  p_years_of_experience text,
  p_posting_url text,
  p_original_description text,
  p_responsibilities text[],
  p_qualifications text[],
  p_skills jsonb,
  p_initial_status text default 'saved'
)
returns uuid
language plpgsql
as $$
declare
  v_application_id uuid;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  insert into public.applications (
    user_id, creation_key, company, job_title, location, country,
    work_arrangement, employment_type, work_term_duration, deadline,
    salary_text, education_requirements, years_of_experience, posting_url,
    original_description, responsibilities, qualifications, status
  )
  values (
    p_user_id, p_creation_key, p_company, p_job_title, p_location, p_country,
    p_work_arrangement, p_employment_type, p_work_term_duration, p_deadline,
    p_salary_text, p_education_requirements, p_years_of_experience, p_posting_url,
    p_original_description, p_responsibilities, p_qualifications, p_initial_status
  )
  on conflict (user_id, creation_key) do nothing
  returning id into v_application_id;

  if v_application_id is null then
    select id into v_application_id
    from public.applications
    where user_id = p_user_id and creation_key = p_creation_key;
    return v_application_id;
  end if;

  insert into public.application_skills (
    user_id, application_id, requirement_type, name, normalized_name, sort_order
  )
  select
    p_user_id,
    v_application_id,
    (skill ->> 'requirement_type')::text,
    (skill ->> 'name')::text,
    (skill ->> 'normalized_name')::text,
    coalesce((skill ->> 'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_skills, '[]'::jsonb)) as skill
  where (skill ->> 'name') is not null
    and length(trim((skill ->> 'name')::text)) > 0;

  insert into public.application_status_events (
    user_id, application_id, from_status, to_status
  )
  values (p_user_id, v_application_id, null, p_initial_status);

  return v_application_id;
end;
$$;

grant execute on function public.create_application(
  uuid, uuid, text, text, text, text, text, text, text, date,
  text, text[], text, text, text, text[], text[], jsonb, text
) to authenticated;

-- Duplicates an application with a fresh id, fresh creation key, fresh
-- status history (initial event only), copied job fields and skills, and
-- reset mutable state (notes, dates, archive).
create or replace function public.duplicate_application(
  p_user_id uuid,
  p_application_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_source public.applications%rowtype;
  v_new_id uuid;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  select * into v_source
  from public.applications
  where id = p_application_id and user_id = p_user_id;

  if v_source.id is null then
    return null;
  end if;

  insert into public.applications (
    user_id, creation_key, company, job_title, location, country,
    work_arrangement, employment_type, work_term_duration, deadline,
    salary_text, education_requirements, years_of_experience, posting_url,
    original_description, responsibilities, qualifications, status
  )
  values (
    p_user_id, gen_random_uuid(), v_source.company, v_source.job_title,
    v_source.location, v_source.country, v_source.work_arrangement,
    v_source.employment_type, v_source.work_term_duration, v_source.deadline,
    v_source.salary_text, v_source.education_requirements,
    v_source.years_of_experience, v_source.posting_url,
    v_source.original_description, v_source.responsibilities,
    v_source.qualifications, 'saved'
  )
  returning id into v_new_id;

  insert into public.application_skills (
    user_id, application_id, requirement_type, name, normalized_name, sort_order
  )
  select user_id, v_new_id, requirement_type, name, normalized_name, sort_order
  from public.application_skills
  where application_id = p_application_id and user_id = p_user_id;

  insert into public.application_status_events (
    user_id, application_id, from_status, to_status
  )
  values (p_user_id, v_new_id, null, 'saved');

  return v_new_id;
end;
$$;

grant execute on function public.duplicate_application(uuid, uuid) to authenticated;
