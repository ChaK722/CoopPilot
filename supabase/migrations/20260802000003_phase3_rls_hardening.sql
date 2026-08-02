-- Phase 3 hardening (2026-08-02):
--  1. interviews UPDATE policy now verifies the parent application belongs
--     to the caller, so an interview cannot be re-linked to another user's
--     application.
--  2. application_status_events becomes append-only for ordinary users:
--     direct insert/update/delete are revoked; every event (initial or
--     future status change) must be written by a controlled transactional
--     RPC, which verifies auth.uid() and runs security definer so RLS on
--     the event table cannot be bypassed by clients.

-- ---------------------------------------------------------------------------
-- interviews: parent ownership on update
-- ---------------------------------------------------------------------------
drop policy if exists "interviews update own" on public.interviews;

create policy "interviews update own" on public.interviews
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- application_status_events: append-only
-- ---------------------------------------------------------------------------
drop policy if exists "application_status_events insert own"
  on public.application_status_events;
drop policy if exists "application_status_events update own"
  on public.application_status_events;
drop policy if exists "application_status_events delete own"
  on public.application_status_events;

-- The SELECT policy remains; ordinary users can read their own history.

-- ---------------------------------------------------------------------------
-- Transactional RPCs run as the function owner so they can write events;
-- both verify p_user_id against auth.uid() before touching any row.
-- ---------------------------------------------------------------------------
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
security definer set search_path = public
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

create or replace function public.duplicate_application(
  p_user_id uuid,
  p_application_id uuid
)
returns uuid
language plpgsql
security definer set search_path = public
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
