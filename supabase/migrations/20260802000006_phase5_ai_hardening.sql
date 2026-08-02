-- Phase 5 hardening: results bound to runs, atomic idempotency, strict run
-- lifecycle, application binding, and atomic interview-prep bundles.
-- This migration is additive; 20260802000005 is not modified.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
alter table public.match_analyses
  add column ai_run_id uuid references public.ai_runs(id) on delete set null;

alter table public.generated_documents
  add column ai_run_id uuid references public.ai_runs(id) on delete set null;

alter table public.ai_runs
  add column result_json jsonb;

-- At most one result per run (match) and per run/type (documents).
create unique index match_analyses_run_unique
  on public.match_analyses (ai_run_id) where ai_run_id is not null;
create unique index generated_documents_run_type_unique
  on public.generated_documents (ai_run_id, document_type) where ai_run_id is not null;

create index match_analyses_ai_run_idx on public.match_analyses (ai_run_id);
create index generated_documents_ai_run_idx on public.generated_documents (ai_run_id);

-- ---------------------------------------------------------------------------
-- create_ai_run: atomic, concurrency-safe idempotency
-- ---------------------------------------------------------------------------
drop function if exists public.create_ai_run(uuid, uuid, text, uuid, text);

create or replace function public.create_ai_run(
  p_user_id uuid,
  p_application_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_generation_mode text
)
returns table (id uuid, status text, created boolean, safe_error_message text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_run_id uuid;
  v_status text;
  v_safe_error text;
  v_created boolean;
begin
  -- Identity first, then operation shape, then ownership.
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_operation not in ('job_extraction', 'match_analysis', 'cover_letter', 'interview_prep') then
    raise exception 'invalid operation';
  end if;

  if p_generation_mode not in ('demo', 'external') then
    raise exception 'invalid mode';
  end if;

  if p_operation = 'job_extraction' then
    if p_application_id is not null then
      raise exception 'job_extraction must not reference an application';
    end if;
  else
    if p_application_id is null then
      raise exception 'application is required';
    end if;
    if not exists (
      select 1 from public.applications
      where applications.id = p_application_id and applications.user_id = p_user_id
    ) then
      return query select
        '00000000-0000-0000-0000-000000000000'::uuid,
        'not_found'::text,
        false,
        'The application was not found or is not yours.';
      return;
    end if;
  end if;

  -- Atomic insert; exactly one concurrent caller wins.
  insert into public.ai_runs (
    user_id, application_id, operation, idempotency_key,
    generation_mode, status, started_at
  )
  values (
    p_user_id, p_application_id, p_operation, p_idempotency_key,
    p_generation_mode, 'running', now()
  )
  on conflict (user_id, operation, idempotency_key) do nothing
  returning ai_runs.id, ai_runs.status into v_run_id, v_status;

  if v_run_id is not null then
    return query select v_run_id, v_status, true::boolean, null::text;
    return;
  end if;

  -- The conflicting row already exists; read it (possibly committed by a
  -- concurrent transaction just after the insert attempt).
  select ai_runs.id, ai_runs.status, ai_runs.safe_error_message
  into v_run_id, v_status, v_safe_error
  from public.ai_runs
  where ai_runs.user_id = p_user_id
    and ai_runs.operation = p_operation
    and ai_runs.idempotency_key = p_idempotency_key;

  return query select v_run_id, v_status, false::boolean, v_safe_error;
end;
$$;

grant execute on function public.create_ai_run(uuid, uuid, text, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- complete_ai_run: failure path only (running -> failed)
-- ---------------------------------------------------------------------------
create or replace function public.complete_ai_run(
  p_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_safe_error text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_status <> 'failed' then
    raise exception 'invalid status';
  end if;

  update public.ai_runs
  set status = 'failed',
      safe_error_message = p_safe_error,
      completed_at = now()
  where id = p_run_id
    and user_id = p_user_id
    and status = 'running';
end;
$$;

grant execute on function public.complete_ai_run(uuid, uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Shared run-lock/validation helper used by result RPCs
-- ---------------------------------------------------------------------------
create or replace function public.lock_ai_run(
  p_user_id uuid,
  p_run_id uuid,
  p_application_id uuid,
  p_operation text,
  p_mode text
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_run_app uuid;
  v_mode text;
  v_operation text;
begin
  select ai_runs.status, ai_runs.application_id, ai_runs.generation_mode, ai_runs.operation
  into v_status, v_run_app, v_mode, v_operation
  from public.ai_runs
  where ai_runs.id = p_run_id and ai_runs.user_id = p_user_id
  for update;

  if v_status is null then
    return 'not_found';
  end if;
  if v_run_app is distinct from p_application_id then
    return 'application_mismatch';
  end if;
  if v_operation is distinct from p_operation then
    return 'operation_mismatch';
  end if;
  if v_mode is distinct from p_mode then
    return 'mode_mismatch';
  end if;
  if v_status = 'succeeded' then
    return 'succeeded';
  end if;
  if v_status = 'failed' then
    return 'failed';
  end if;
  if v_status <> 'running' then
    return 'invalid_state';
  end if;
  return 'running';
end;
$$;

grant execute on function public.lock_ai_run(uuid, uuid, uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- insert_match_analysis: run-bound, idempotent, transactional
-- ---------------------------------------------------------------------------
create or replace function public.insert_match_analysis(
  p_user_id uuid,
  p_application_id uuid,
  p_run_id uuid,
  p_analysis jsonb,
  p_mode text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_lock_state text;
  v_analysis_id uuid;
  v_overall integer;
  v_req integer;
  v_pref integer;
  v_exp integer;
  v_edu integer;
  v_loc integer;
  v_sum integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_mode not in ('demo', 'external') then
    raise exception 'invalid mode';
  end if;

  v_lock_state := public.lock_ai_run(
    p_user_id, p_run_id, p_application_id, 'match_analysis', p_mode
  );

  if v_lock_state = 'not_found' then
    return null;
  end if;
  if v_lock_state = 'succeeded' then
    select id into v_analysis_id
    from public.match_analyses
    where ai_run_id = p_run_id;
    return v_analysis_id;
  end if;
  if v_lock_state <> 'running' then
    raise exception 'invalid run state: %', v_lock_state;
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
  ) then
    return null;
  end if;

  -- Payload invariants.
  v_overall := (p_analysis ->> 'overall_score')::int;
  v_req := (p_analysis #>> '{score_breakdown,required_skills,score}')::int;
  v_pref := (p_analysis #>> '{score_breakdown,preferred_skills,score}')::int;
  v_exp := (p_analysis #>> '{score_breakdown,relevant_experience,score}')::int;
  v_edu := (p_analysis #>> '{score_breakdown,education,score}')::int;
  v_loc := (p_analysis #>> '{score_breakdown,location_availability,score}')::int;
  v_sum := v_req + v_pref + v_exp + v_edu + v_loc;

  if v_overall < 0 or v_overall > 100 then
    raise exception 'invalid overall score';
  end if;
  if v_req < 0 or v_req > 40 or v_pref < 0 or v_pref > 20
     or v_exp < 0 or v_exp > 20 or v_edu < 0 or v_edu > 10
     or v_loc < 0 or v_loc > 10 then
    raise exception 'component score exceeds its weight';
  end if;
  if v_sum <> v_overall then
    raise exception 'component scores must sum to overall score';
  end if;
  if nullif((p_analysis ->> 'profile_source_hash'), '') is null
     or nullif((p_analysis ->> 'application_source_hash'), '') is null then
    raise exception 'source hashes are required';
  end if;

  insert into public.match_analyses (
    user_id, application_id, ai_run_id, overall_score, score_breakdown,
    matching_skills, missing_required_skills, missing_preferred_skills,
    matching_experience, relevant_projects, keywords, suggestions,
    profile_source_hash, application_source_hash, generation_mode
  )
  values (
    p_user_id, p_application_id, p_run_id, v_overall,
    p_analysis -> 'score_breakdown',
    coalesce(p_analysis -> 'matching_skills', '[]'::jsonb),
    coalesce(
      (select array(select jsonb_array_elements_text(p_analysis -> 'missing_required_skills'))),
      '{}'::text[]
    ),
    coalesce(
      (select array(select jsonb_array_elements_text(p_analysis -> 'missing_preferred_skills'))),
      '{}'::text[]
    ),
    coalesce(p_analysis -> 'matching_experience', '[]'::jsonb),
    coalesce(p_analysis -> 'relevant_projects', '[]'::jsonb),
    coalesce(
      (select array(select jsonb_array_elements_text(p_analysis -> 'keywords'))),
      '{}'::text[]
    ),
    coalesce(
      (select array(select jsonb_array_elements_text(p_analysis -> 'suggestions'))),
      '{}'::text[]
    ),
    (p_analysis ->> 'profile_source_hash'),
    (p_analysis ->> 'application_source_hash'),
    p_mode
  )
  returning id into v_analysis_id;

  update public.ai_runs
  set status = 'succeeded', completed_at = now()
  where id = p_run_id and user_id = p_user_id;

  return v_analysis_id;
end;
$$;

grant execute on function public.insert_match_analysis(uuid, uuid, uuid, jsonb, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Cover letter generation: run-bound, idempotent
-- ---------------------------------------------------------------------------
create or replace function public.insert_cover_letter_generation(
  p_user_id uuid,
  p_application_id uuid,
  p_run_id uuid,
  p_content text,
  p_mode text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_lock_state text;
  v_version integer;
  v_existing integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_mode not in ('demo', 'external') then
    raise exception 'invalid mode';
  end if;

  v_lock_state := public.lock_ai_run(
    p_user_id, p_run_id, p_application_id, 'cover_letter', p_mode
  );

  if v_lock_state = 'not_found' then
    return null;
  end if;
  if v_lock_state = 'succeeded' then
    select version into v_existing
    from public.generated_documents
    where ai_run_id = p_run_id and document_type = 'cover_letter';
    return v_existing;
  end if;
  if v_lock_state <> 'running' then
    raise exception 'invalid run state: %', v_lock_state;
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
    for update
  ) then
    return null;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.generated_documents
  where application_id = p_application_id and document_type = 'cover_letter';

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited, ai_run_id
  )
  values (
    p_user_id, p_application_id, 'cover_letter', v_version,
    p_content, null, p_mode, false, p_run_id
  );

  update public.ai_runs
  set status = 'succeeded', completed_at = now()
  where id = p_run_id and user_id = p_user_id;

  return v_version;
end;
$$;

grant execute on function public.insert_cover_letter_generation(
  uuid, uuid, uuid, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Cover letter manual revision (edit/restore): never an AI run
-- ---------------------------------------------------------------------------
create or replace function public.insert_cover_letter_revision(
  p_user_id uuid,
  p_application_id uuid,
  p_content text,
  p_revision_source text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_version integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_revision_source not in ('edited', 'restored') then
    raise exception 'invalid revision source';
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
    for update
  ) then
    return null;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.generated_documents
  where application_id = p_application_id and document_type = 'cover_letter';

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited, ai_run_id
  )
  values (
    p_user_id, p_application_id, 'cover_letter', v_version,
    p_content, null, 'demo', true, null
  );

  return v_version;
end;
$$;

grant execute on function public.insert_cover_letter_revision(
  uuid, uuid, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Interview prep bundle: all three types in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.insert_interview_prep_bundle(
  p_user_id uuid,
  p_application_id uuid,
  p_run_id uuid,
  p_mode text,
  p_behavioural jsonb,
  p_technical jsonb,
  p_research jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_lock_state text;
  v_versions integer[];
  v_version integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_mode not in ('demo', 'external') then
    raise exception 'invalid mode';
  end if;

  if jsonb_typeof(p_behavioural) <> 'object'
     or jsonb_typeof(p_technical) <> 'object'
     or jsonb_typeof(p_research) <> 'object' then
    raise exception 'all three parts must be JSON objects';
  end if;

  v_lock_state := public.lock_ai_run(
    p_user_id, p_run_id, p_application_id, 'interview_prep', p_mode
  );

  if v_lock_state = 'not_found' then
    return;
  end if;
  if v_lock_state = 'succeeded' then
    -- Idempotent retry: nothing to do; results are already bound to the run.
    return;
  end if;
  if v_lock_state <> 'running' then
    raise exception 'invalid run state: %', v_lock_state;
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
    for update
  ) then
    return;
  end if;

  for v_version in
    select coalesce(max(version), 0) + 1
    from public.generated_documents
    where application_id = p_application_id and document_type = 'behavioural_questions'
  loop
    v_versions := array_append(v_versions, v_version);
  end loop;

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited, ai_run_id
  )
  values (
    p_user_id, p_application_id, 'behavioural_questions', v_versions[1],
    null, p_behavioural, p_mode, false, p_run_id
  );

  v_versions := '{}'::integer[];
  for v_version in
    select coalesce(max(version), 0) + 1
    from public.generated_documents
    where application_id = p_application_id and document_type = 'technical_questions'
  loop
    v_versions := array_append(v_versions, v_version);
  end loop;

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited, ai_run_id
  )
  values (
    p_user_id, p_application_id, 'technical_questions', v_versions[1],
    null, p_technical, p_mode, false, p_run_id
  );

  v_versions := '{}'::integer[];
  for v_version in
    select coalesce(max(version), 0) + 1
    from public.generated_documents
    where application_id = p_application_id and document_type = 'research_checklist'
  loop
    v_versions := array_append(v_versions, v_version);
  end loop;

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited, ai_run_id
  )
  values (
    p_user_id, p_application_id, 'research_checklist', v_versions[1],
    null, p_research, p_mode, false, p_run_id
  );

  update public.ai_runs
  set status = 'succeeded', completed_at = now()
  where id = p_run_id and user_id = p_user_id;
end;
$$;

grant execute on function public.insert_interview_prep_bundle(
  uuid, uuid, uuid, text, jsonb, jsonb, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Job extraction result persistence
-- ---------------------------------------------------------------------------
create or replace function public.save_job_extraction_result(
  p_user_id uuid,
  p_run_id uuid,
  p_result jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_operation text;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  select ai_runs.status, ai_runs.operation into v_status, v_operation
  from public.ai_runs
  where ai_runs.id = p_run_id and ai_runs.user_id = p_user_id
  for update;

  if v_status is null then
    return;
  end if;
  if v_operation <> 'job_extraction' then
    raise exception 'invalid operation';
  end if;
  if v_status = 'succeeded' then
    -- Idempotent retry: result already saved.
    return;
  end if;
  if v_status <> 'running' then
    raise exception 'invalid run state: %', v_status;
  end if;

  update public.ai_runs
  set result_json = p_result,
      status = 'succeeded',
      completed_at = now()
  where id = p_run_id and user_id = p_user_id;
end;
$$;

grant execute on function public.save_job_extraction_result(uuid, uuid, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Revoke the old permissive document insert from ordinary users; new code
-- uses the specialized RPCs above.
-- ---------------------------------------------------------------------------
revoke execute on function public.insert_generated_document(
  uuid, uuid, text, text, jsonb, text, boolean, uuid
) from authenticated;
