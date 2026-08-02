-- Phase 5: AI run infrastructure, match analyses, and generated documents.
-- Follows the established conventions: UUID PKs, user_id on every row, RLS
-- with parent-ownership checks on child tables, append-only snapshots for
-- analyses/documents, and security-definer RPCs for all writes.

-- ---------------------------------------------------------------------------
-- ai_runs
-- ---------------------------------------------------------------------------
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  operation text not null,
  idempotency_key uuid not null,
  generation_mode text not null default 'demo',
  status text not null default 'pending',
  safe_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ai_runs_operation_valid check (
    operation in ('job_extraction', 'match_analysis', 'cover_letter', 'interview_prep')
  ),
  constraint ai_runs_mode_valid check (generation_mode in ('demo', 'external')),
  constraint ai_runs_status_valid check (
    status in ('pending', 'running', 'succeeded', 'failed')
  ),
  constraint ai_runs_idempotency_unique unique (user_id, operation, idempotency_key)
);

alter table public.ai_runs enable row level security;

create policy "ai_runs select own" on public.ai_runs
  for select to authenticated
  using (user_id = auth.uid());
-- ai_runs is write-only through the security-definer RPCs below; ordinary
-- users only read their own runs.
grant select on public.ai_runs to authenticated;

create index ai_runs_user_idx on public.ai_runs (user_id, created_at desc);
create index ai_runs_application_idx on public.ai_runs (application_id);

-- ---------------------------------------------------------------------------
-- match_analyses
-- ---------------------------------------------------------------------------
create table public.match_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  overall_score integer not null,
  score_breakdown jsonb not null,
  matching_skills jsonb not null default '[]',
  missing_required_skills text[] not null default '{}',
  missing_preferred_skills text[] not null default '{}',
  matching_experience jsonb not null default '[]',
  relevant_projects jsonb not null default '[]',
  keywords text[] not null default '{}',
  suggestions text[] not null default '{}',
  profile_source_hash text not null,
  application_source_hash text not null,
  generation_mode text not null default 'demo',
  generated_at timestamptz not null default now(),
  constraint match_analyses_score_range check (overall_score between 0 and 100),
  constraint match_analyses_mode_valid check (generation_mode in ('demo', 'external')),
  constraint match_analyses_hashes_not_blank check (
    length(trim(profile_source_hash)) > 0 and length(trim(application_source_hash)) > 0
  )
);

alter table public.match_analyses enable row level security;

create policy "match_analyses select own" on public.match_analyses
  for select to authenticated
  using (user_id = auth.uid());
-- Snapshots are append-only: writes only through insert_match_analysis.
grant select on public.match_analyses to authenticated;

create index match_analyses_application_generated_idx
  on public.match_analyses (application_id, generated_at desc);
create index match_analyses_user_idx on public.match_analyses (user_id);

-- ---------------------------------------------------------------------------
-- generated_documents
-- ---------------------------------------------------------------------------
create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null,
  version integer not null,
  content_text text,
  content_json jsonb,
  generation_mode text not null default 'demo',
  user_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generated_documents_type_valid check (
    document_type in ('cover_letter', 'behavioural_questions', 'technical_questions', 'research_checklist')
  ),
  constraint generated_documents_mode_valid check (generation_mode in ('demo', 'external')),
  constraint generated_documents_version_positive check (version >= 1),
  constraint generated_documents_content_present check (
    content_text is not null or content_json is not null
  ),
  constraint generated_documents_version_unique
    unique (application_id, document_type, version)
);

alter table public.generated_documents enable row level security;

create policy "generated_documents select own" on public.generated_documents
  for select to authenticated
  using (user_id = auth.uid());
-- Versioned snapshots are append-only: writes only through
-- insert_generated_document.
grant select on public.generated_documents to authenticated;

create trigger generated_documents_set_updated_at
  before update on public.generated_documents
  for each row
  execute function public.set_updated_at();

create index generated_documents_application_type_version_idx
  on public.generated_documents (application_id, document_type, version desc);
create index generated_documents_user_idx on public.generated_documents (user_id);

-- ---------------------------------------------------------------------------
-- RPCs: all writes flow through security-definer functions that verify the
-- caller identity first and use a fixed search_path.
-- ---------------------------------------------------------------------------

-- Idempotent run creation: an existing (user, operation, idempotency_key)
-- row is returned instead of creating a duplicate.
create or replace function public.create_ai_run(
  p_user_id uuid,
  p_application_id uuid,
  p_operation text,
  p_idempotency_key uuid,
  p_generation_mode text
)
returns table (id uuid, status text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_run_id uuid;
  v_status text;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if p_operation not in ('job_extraction', 'match_analysis', 'cover_letter', 'interview_prep') then
    raise exception 'invalid operation';
  end if;

  if p_generation_mode not in ('demo', 'external') then
    raise exception 'invalid mode';
  end if;

  select ai_runs.id, ai_runs.status into v_run_id, v_status
  from public.ai_runs
  where ai_runs.user_id = p_user_id
    and ai_runs.operation = p_operation
    and ai_runs.idempotency_key = p_idempotency_key;

  if v_run_id is not null then
    return query select v_run_id, v_status;
    return;
  end if;

  insert into public.ai_runs (
    user_id, application_id, operation, idempotency_key,
    generation_mode, status, started_at
  )
  values (
    p_user_id, p_application_id, p_operation, p_idempotency_key,
    p_generation_mode, 'running', now()
  )
  returning ai_runs.id, ai_runs.status into v_run_id, v_status;

  return query select v_run_id, v_status;
end;
$$;

grant execute on function public.create_ai_run(uuid, uuid, text, uuid, text)
  to authenticated;

-- Marks a run failed/succeeded; the safe message never contains secrets.
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

  if p_status not in ('succeeded', 'failed') then
    raise exception 'invalid status';
  end if;

  update public.ai_runs
  set status = p_status,
      safe_error_message = p_safe_error,
      completed_at = now()
  where id = p_run_id and user_id = p_user_id;
end;
$$;

grant execute on function public.complete_ai_run(uuid, uuid, text, text)
  to authenticated;

-- Inserts a match snapshot and marks its run succeeded in one transaction.
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
  v_analysis_id uuid;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
  ) then
    return null;
  end if;

  if not exists (
    select 1 from public.ai_runs
    where id = p_run_id and user_id = p_user_id and operation = 'match_analysis'
  ) then
    return null;
  end if;

  insert into public.match_analyses (
    user_id, application_id, overall_score, score_breakdown,
    matching_skills, missing_required_skills, missing_preferred_skills,
    matching_experience, relevant_projects, keywords, suggestions,
    profile_source_hash, application_source_hash, generation_mode
  )
  values (
    p_user_id, p_application_id,
    (p_analysis ->> 'overall_score')::int,
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

-- Inserts the next document version (max+1 per application/type) and marks
-- its run succeeded in one transaction. Returns the new version number.
create or replace function public.insert_generated_document(
  p_user_id uuid,
  p_application_id uuid,
  p_document_type text,
  p_content_text text,
  p_content_json jsonb,
  p_mode text,
  p_user_edited boolean,
  p_run_id uuid
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

  if p_document_type not in (
    'cover_letter', 'behavioural_questions', 'technical_questions', 'research_checklist'
  ) then
    raise exception 'invalid document type';
  end if;

  if not exists (
    select 1 from public.applications
    where id = p_application_id and user_id = p_user_id
  ) then
    return null;
  end if;

  if not exists (
    select 1 from public.ai_runs
    where id = p_run_id and user_id = p_user_id
      and operation in ('cover_letter', 'interview_prep')
  ) then
    return null;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.generated_documents
  where application_id = p_application_id and document_type = p_document_type;

  insert into public.generated_documents (
    user_id, application_id, document_type, version,
    content_text, content_json, generation_mode, user_edited
  )
  values (
    p_user_id, p_application_id, p_document_type, v_version,
    p_content_text, p_content_json, p_mode, p_user_edited
  );

  update public.ai_runs
  set status = 'succeeded', completed_at = now()
  where id = p_run_id and user_id = p_user_id;

  return v_version;
end;
$$;

grant execute on function public.insert_generated_document(
  uuid, uuid, text, text, jsonb, text, boolean, uuid
) to authenticated;
